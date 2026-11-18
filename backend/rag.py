"""RAG logic: transcript (kisi bhi zubaan ki) -> English -> chunks -> FAISS -> Gemini answer (with timestamps)."""
import json
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()
os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY", "")

# Free, local embeddings. Transcript English me convert hoti hai, isliye English model kaafi hai.
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# Models ki list: ek busy (503) ho to agla try hota hai
MODEL_NAMES = [m.strip() for m in os.getenv(
    "GEMINI_MODELS", "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.8-flash"
).split(",") if m.strip()]

# ---- Caches (video_id ke hisaab se) ----
_stores = {}      # FAISS store (English chunks)
_texts = {}       # poora English transcript text
_meta = {}        # title, chunks, source language, translated...
_orig_segs = {}   # original transcript: [{"start", "text"}]
_en_segs = {}     # English transcript:  [{"start", "text"}]
_roman = {}       # Roman Urdu transcript (jab user maange): [{"start", "text"}]
_overviews = {}   # (video_id, language) -> {summary, questions}

# ---- Deploy ke liye limits (env se badal sakte ho) ----
MAX_VIDEOS = int(os.getenv("MAX_VIDEOS", "15"))                          # memory me itni videos tak
MAX_TRANSLATE_SNIPPETS = int(os.getenv("MAX_TRANSLATE_SNIPPETS", "1500"))  # isse lambi non-English video translate nahi hogi
ENABLE_GEMINI_TRANSCRIBE = os.getenv("ENABLE_GEMINI_TRANSCRIBE", "true").lower() == "true"


def _evict_old():
    """Memory bachane ke liye sabse purani videos hata deta hai."""
    while len(_stores) > MAX_VIDEOS:
        oldest = next(iter(_stores))
        for d in (_stores, _texts, _meta, _orig_segs, _en_segs, _roman):
            d.pop(oldest, None)
        for k in [k for k in _overviews if k[0] == oldest]:
            _overviews.pop(k, None)


class TranslationError(Exception):
    """Transcript ka translation nahi ho saka."""


# ---------------------------------------------------------------- helpers
def get_video_id(url_or_id: str) -> str:
    """YouTube URL (watch, youtu.be, shorts, embed) ya seedhi ID se video ID nikalta hai."""
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", url_or_id)
    return m.group(1) if m else url_or_id.strip()


def fmt(sec: int) -> str:
    return f"{sec // 60}:{sec % 60:02d}"


def get_text(response) -> str:
    """Gemini ka jawab kabhi string, kabhi blocks ki list hota hai. Dono ko saaf text banata hai."""
    c = response.content
    if isinstance(c, str):
        return c
    return "".join(b.get("text", "") for b in c if isinstance(b, dict))


def get_title(vid: str) -> str:
    """YouTube oEmbed se title nikalta hai (key nahi chahiye). Fail ho to khali string."""
    try:
        url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(
            f"https://www.youtube.com/watch?v={vid}", safe="")
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.loads(r.read().decode()).get("title", "")
    except Exception:
        return ""


def _call_llm(prompt: str) -> str:
    last_error = None
    for name in MODEL_NAMES:
        try:
            llm = ChatGoogleGenerativeAI(model=name, max_retries=1, timeout=60)
            return get_text(llm.invoke(prompt))
        except Exception as e:  # 503 / 404 / quota -> agla model
            last_error = e
    raise RuntimeError(f"Saare models fail hue: {last_error}")


# ---------------------------------------------------------------- transcript + translation
def _yt_api():
    """YouTubeTranscriptApi. Cloud pe YouTube IP block kare to YT_PROXY_URL env me proxy de sakte ho."""
    proxy = os.getenv("YT_PROXY_URL", "").strip()
    if proxy:
        from youtube_transcript_api.proxies import GenericProxyConfig
        return YouTubeTranscriptApi(proxy_config=GenericProxyConfig(http_url=proxy, https_url=proxy))
    return YouTubeTranscriptApi()


def transcribe_with_gemini(vid: str):
    """Captions na hon (ya YouTube block kare) to Gemini khud video ki audio sun ke transcript banata hai.
    Sirf public videos. Free tier me roz ~8 ghante YouTube video ki limit hai. Output English me maanga jata hai."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
    prompt = (
        "Transcribe the speech in this video. If the speech is not in English, translate it to English. "
        "Output one line per sentence or phrase in exactly this format: [MM:SS] text. "
        "Use MM:SS (or H:MM:SS for videos longer than an hour). No commentary, no headings."
    )
    contents = types.Content(parts=[
        types.Part(file_data=types.FileData(file_uri=f"https://www.youtube.com/watch?v={vid}")),
        types.Part(text=prompt),
    ])

    last_error = None
    for name in MODEL_NAMES:
        try:
            raw = client.models.generate_content(model=name, contents=contents).text or ""
            segs = []
            for line in raw.splitlines():
                m = re.match(r"^\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*[-:]?\s*(.+)$", line)
                if not m:
                    continue
                a, b, c, text = m.groups()
                secs = int(a) * 3600 + int(b) * 60 + int(c) if c else int(a) * 60 + int(b)
                segs.append({"start": secs, "text": text.strip()})
            if len(segs) >= 3:
                segs.sort(key=lambda x: x["start"])
                return segs
            last_error = "Gemini se transcript nahi bani"
        except Exception as e:
            last_error = e
    raise RuntimeError(f"Gemini audio transcription fail: {last_error}")


def fetch_transcript(vid: str):
    """Jo transcript available ho wo nikalta hai. English ko tarjeeh, phir Hindi/Urdu, phir koi bhi."""
    transcripts = list(_yt_api().list(vid))
    if not transcripts:
        raise ValueError("Is video ke captions available nahi hain")

    def pick():
        for t in transcripts:
            if t.language_code.lower().startswith("en"):
                return t
        for code in ("hi", "ur"):
            for t in transcripts:
                if t.language_code.lower().startswith(code):
                    return t
        return transcripts[0]

    t = pick()
    segs = [{"start": int(s.start), "text": s.text.replace("\n", " ").strip()} for s in t.fetch()]
    return t, segs


TARGETS = {
    "english": "English",
    "roman_urdu": "Roman Urdu (natural spoken Urdu/Hindi written in English letters)",
}
BATCH = 60


def _translate_batch(lines, target_desc, source_label):
    """Ek batch translate karta hai. Return: list (same length) ya None agar fail."""
    numbered = "\n".join(f"{i + 1}|{l}" for i, l in enumerate(lines))
    prompt = f"""Translate each numbered subtitle line from {source_label} to {target_desc}.
Keep names and technical terms. Do not merge or skip lines.
Output EXACTLY one line per input line in the format N|translation (same numbers). Output nothing else.

{numbered}"""
    for attempt in range(2):
        try:
            raw = _call_llm(prompt)
            found = {}
            for line in raw.splitlines():
                m = re.match(r"^\s*(\d+)\s*[|:.)\-]\s*(.*)$", line)
                if m:
                    found[int(m.group(1))] = m.group(2).strip()
            if len(found) >= 0.7 * len(lines):
                return [found.get(i + 1, lines[i]) for i in range(len(lines))]
        except Exception:
            pass
        time.sleep(2)
    return None


def translate_lines(lines, target_key, source_label):
    """Saari lines batches me translate karta hai. Return: (translated, failed_batches, total_batches)."""
    target_desc = TARGETS[target_key]
    starts = list(range(0, len(lines), BATCH))
    with ThreadPoolExecutor(max_workers=3) as ex:
        results = list(ex.map(
            lambda i: _translate_batch(lines[i:i + BATCH], target_desc, source_label), starts))

    out, failed = [], 0
    for i, res in zip(starts, results):
        if res is None:
            failed += 1
            out.extend(lines[i:i + BATCH])   # fail hua to original line rakho
        else:
            out.extend(res)
    return out, failed, len(starts)


def load_video(url: str) -> dict:
    vid = get_video_id(url)
    if vid in _stores:
        return {"video_id": vid, "cached": True, **_meta[vid]}

    ai_transcribed = False
    try:
        t, orig = fetch_transcript(vid)
        is_english = t.language_code.lower().startswith("en")
        lang_code, lang_name = t.language_code, t.language
    except Exception as caption_error:
        # Captions nahi mile (ya YouTube ne block kiya) -> Gemini se audio transcribe karwao
        if not ENABLE_GEMINI_TRANSCRIBE:
            raise
        try:
            orig = transcribe_with_gemini(vid)
        except Exception as gemini_error:
            raise ValueError(
                f"Captions nahi mile ({caption_error}). Gemini se audio transcribe bhi nahi ho saki: {gemini_error}"
            )
        t, is_english, ai_transcribed = None, True, True      # Gemini ne English me hi di
        lang_code, lang_name = "en", "English (Gemini audio transcription)"
    translated, partial = False, False

    if is_english:
        en = orig
    else:
        if len(orig) > MAX_TRANSLATE_SNIPPETS:
            raise TranslationError(
                "Is video ki transcript translate karne ke liye bohat lambi hai. Chhoti video try karo."
            )
        texts = [s["text"] for s in orig]
        en_texts, failed, total = translate_lines(texts, "english", t.language)

        if total and failed == total:
            # Gemini se nahi hua -> YouTube ki built-in translation try karo
            try:
                if not t.is_translatable:
                    raise ValueError("not translatable")
                yt = t.translate("en").fetch()
                en = [{"start": int(s.start), "text": s.text.replace("\n", " ").strip()} for s in yt]
            except Exception:
                raise TranslationError(
                    "Transcript English me convert nahi ho saki (model busy ho sakta hai). Thori der baad try karo."
                )
        else:
            en = [{"start": o["start"], "text": tx} for o, tx in zip(orig, en_texts)]
            partial = failed > 0
        translated = True

    docs = []
    for i in range(0, len(en), 25):
        g = en[i:i + 25]
        docs.append(Document(
            page_content=" ".join(s["text"] for s in g),
            metadata={"start": g[0]["start"]},
        ))

    _stores[vid] = FAISS.from_documents(docs, embeddings)
    _texts[vid] = " ".join(s["text"] for s in en)
    _orig_segs[vid] = orig
    _en_segs[vid] = en
    _meta[vid] = {
        "title": get_title(vid),
        "chunks": len(docs),
        "source_language": lang_code,
        "source_language_name": lang_name,
        "translated": translated,
        "partial": partial,
        "ai_transcribed": ai_transcribed,
    }
    _evict_old()
    return {"video_id": vid, "cached": False, **_meta[vid]}


def get_transcript(video_id: str, lang: str = "english") -> dict:
    """Transcript panel ke liye: english / original / roman_urdu."""
    if video_id not in _en_segs:
        raise KeyError("Video load nahi hui")

    partial = False
    if lang == "original":
        segs = _orig_segs[video_id]
    elif lang == "roman_urdu":
        if video_id not in _roman:
            orig = _orig_segs[video_id]
            label = _meta[video_id]["source_language_name"] or "the source language"
            out, failed, total = translate_lines([s["text"] for s in orig], "roman_urdu", label)
            if total and failed == total:
                raise TranslationError("Roman Urdu me convert nahi ho saki (model busy ho sakta hai). Thori der baad try karo.")
            _roman[video_id] = {
                "segs": [{"start": o["start"], "text": tx} for o, tx in zip(orig, out)],
                "partial": failed > 0,
            }
        segs, partial = _roman[video_id]["segs"], _roman[video_id]["partial"]
    else:
        segs = _en_segs[video_id]
        partial = _meta[video_id]["partial"]

    return {
        "lines": [{"start": s["start"], "time": fmt(s["start"]), "text": s["text"]} for s in segs],
        "partial": partial,
    }


# ---------------------------------------------------------------- chat
LANGUAGE_RULES = {
    "auto": "Reply in the same language and script as the user's question.",
    "english": "Reply in English.",
    "roman_urdu": "Reply in Roman Urdu (Urdu written in English letters).",
    "hindi": "Reply in Hindi (Devanagari script).",
    "urdu": "Reply in Urdu (Urdu script).",
}

FOLLOWUP_MARKER = "[FOLLOWUPS]"


def _split_followups(answer: str):
    """Jawab ke aakhri hisse se follow-up sawal alag karta hai."""
    if FOLLOWUP_MARKER not in answer:
        return answer.strip(), []
    body, tail = answer.split(FOLLOWUP_MARKER, 1)
    lines = [re.sub(r"^[\s\-\u2022*\d\.\)]+", "", l).strip() for l in tail.splitlines()]
    return body.strip(), [l for l in lines if l][:3]


def _search_query(question: str, history, last_q: str, last_a: str) -> str:
    """Sawal (Roman Urdu/Hindi/English, kuch bhi) ko English search query me badalta hai."""
    history_text = "\n".join(f"{m['role']}: {m['text'][:300]}" for m in history[-4:])
    prompt = f"""Rewrite the user's latest question as ONE standalone English search query
for searching an English video transcript. Resolve words like "this", "it", "isko", "ye"
using the chat history. Output ONLY the query, nothing else.

Chat history:
{history_text}

Latest question: {question}"""
    try:
        q = _call_llm(prompt).strip().strip('"')
        if q:
            return q
    except Exception:
        pass
    # Fallback: purani tarkeeb (chhota sawal ho to pichli baat jodo)
    if len(question.split()) <= 8 and last_q:
        return f"{last_q} {last_a[:300]} {question}"
    return question


def ask(video_id: str, question: str, history=None, language: str = "auto") -> dict:
    if video_id not in _stores:
        raise KeyError("Video load nahi hui")

    history = history or []
    last_q = next((m["text"] for m in reversed(history) if m["role"] == "user"), "")
    last_a = next((m["text"] for m in reversed(history) if m["role"] == "bot"), "")

    query = _search_query(question, history, last_q, last_a)
    retriever = _stores[video_id].as_retriever(search_kwargs={"k": 4})
    results = retriever.invoke(query)
    context = "\n\n".join(f"[{fmt(d.metadata['start'])}] {d.page_content}" for d in results)
    history_text = "\n".join(f"{m['role']}: {m['text']}" for m in history[-6:])
    lang_rule = LANGUAGE_RULES.get(language, LANGUAGE_RULES["auto"])

    meta = _meta[video_id]
    note = ""
    if meta["translated"]:
        note = (f"\nNote: the transcript below was machine-translated to English from "
                f"{meta['source_language_name']}, so some wording may be imperfect.\n")

    prompt = f"""You are a helpful assistant for ONE specific YouTube video. Use the transcript context below.{note}

Rules:
1. NORMAL QUESTION: answer ONLY from the transcript context. If the answer is not in the context,
   start your reply with [NOT_FOUND] and briefly say so.
2. If the user says they did not understand, asks to explain again, to make it simpler, or asks for
   another example or analogy: use the chat history to find the idea they mean, re-explain THAT idea
   from the video in simpler words, and add ONE fresh, simple example or analogy (you may use your own
   knowledge for the example). Start the example with "Example:". Stay on the video's topic and use
   the video's own terms. Do not add unrelated topics.
2b. EXTERNAL EXAMPLE: if the user EXPLICITLY asks for an example or explanation from OUTSIDE the video
   (for example "apart from the video", "video ke ilawa", "video ke bahar", "real life example"):
   do NOT retell the video. Start your reply with [EXTERNAL], then a short label line such as
   "💡 Video ke bahar se:" (written in the answer's language), then 1-2 fresh, simple real-world
   examples of the SAME concept (from your own knowledge), each starting with "Example:".
   Use the chat history to know which concept they mean, and add one line connecting it to the video's idea.
3. If the question is unrelated to this video's topic, start your reply with [NOT_FOUND].
4. {lang_rule}
5. Keep it clear: short paragraphs; use Markdown bullets or **bold** where it helps.
6. After your answer (but NOT when you start with [NOT_FOUND]), add a new line with exactly
   {FOLLOWUP_MARKER} and then 3 short follow-up questions (under 10 words each), one per line,
   about this video, in the same language as your answer.

Chat so far:
{history_text}

Transcript context:
{context}

Question: {question}"""

    answer, followups = _split_followups(_call_llm(prompt))

    if answer.startswith("[NOT_FOUND]"):
        return {"answer": answer.replace("[NOT_FOUND]", "", 1).strip(), "sources": [], "followups": []}

    # Video ke bahar ka example: marker hatao aur video ke timestamps (sources) mat dikhao
    if answer.startswith("[EXTERNAL]"):
        return {"answer": answer.replace("[EXTERNAL]", "", 1).strip(), "sources": [], "followups": followups}

    starts = sorted({d.metadata["start"] for d in results})
    return {
        "answer": answer,
        "sources": [{"time": fmt(s), "seconds": s} for s in starts],
        "followups": followups,
    }


def _parse_json(raw: str) -> dict:
    start, end = raw.find("{"), raw.rfind("}")
    return json.loads(raw[start:end + 1])


def overview(video_id: str, language: str = "auto") -> dict:
    """Video ka chhota summary + 5 suggested questions (chuni hui zubaan me)."""
    if video_id not in _texts:
        raise KeyError("Video load nahi hui")
    key = (video_id, language)
    if key in _overviews:
        return _overviews[key]

    lang_rule = "Write in English." if language == "auto" else LANGUAGE_RULES[language]
    text = _texts[video_id][:60000]   # bohat lambi video ke liye limit
    prompt = f"""Below is a YouTube video transcript.
1. Write a short summary in 3-4 sentences.
2. Suggest 5 specific, interesting questions a viewer could ask about this video.
   Each question must be answerable from the transcript and short (under 12 words).
{lang_rule} (Apply this to both the summary and the questions.)

Respond ONLY with JSON in this exact format, nothing else:
{{"summary": "...", "questions": ["...", "...", "...", "...", "..."]}}

Transcript:
{text}"""

    data = _parse_json(_call_llm(prompt))
    result = {"summary": data["summary"], "questions": data["questions"][:5]}
    _overviews[key] = result
    return result
