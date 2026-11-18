"""FastAPI app: /load aur /chat endpoints."""
import os
import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import rag

app = FastAPI(title="YouTube RAG API")

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX") or None,   # jaise: https://.*\\.vercel\\.app
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Simple rate limiting (har IP ke liye, ek ghante me) ----
# Deploy ke baad koi bhi tumhari Gemini key ke credits na kha sake, is liye.
_hits = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, default_per_hour: int):
    limit = int(os.getenv(f"RATE_{name.upper()}_PER_HOUR", default_per_hour))

    def dependency(request: Request):
        now = time.time()
        q = _hits[(name, _client_ip(request))]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Bohat zyada requests ho gayi hain. Thori der (kuch minute) baad dobara try karo.",
            )
        q.append(now)

    return dependency


class LoadReq(BaseModel):
    url: str


class OverviewReq(BaseModel):
    video_id: str
    language: str = "auto"


class TranscriptReq(BaseModel):
    video_id: str
    lang: str = "english"   # english | original | roman_urdu


class HistoryItem(BaseModel):
    role: str   # "user" ya "bot"
    text: str


class ChatReq(BaseModel):
    video_id: str
    question: str
    history: list[HistoryItem] = []
    language: str = "auto"


@app.get("/")
def health():
    return {"status": "ok"}


@app.post("/load", dependencies=[Depends(rate_limit("load", 8))])
def load(req: LoadReq):
    try:
        return rag.load_video(req.url)
    except rag.TranslationError as e:
        raise HTTPException(status_code=503, detail=f"Translation nahi ho saki: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Transcript nahi mili: {e}")


@app.post("/chat", dependencies=[Depends(rate_limit("chat", 60))])
def chat(req: ChatReq):
    try:
        history = [h.model_dump() for h in req.history[-6:]]
        return rag.ask(req.video_id, req.question, history, req.language)
    except KeyError:
        raise HTTPException(status_code=404, detail="Pehle video load karo")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model error (busy ho sakta hai): {e}")


@app.post("/overview", dependencies=[Depends(rate_limit("overview", 30))])
def overview(req: OverviewReq):
    try:
        return rag.overview(req.video_id, req.language)
    except KeyError:
        raise HTTPException(status_code=404, detail="Pehle video load karo")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Overview nahi ban saka: {e}")


@app.post("/transcript", dependencies=[Depends(rate_limit("transcript", 20))])
def transcript(req: TranscriptReq):
    try:
        return rag.get_transcript(req.video_id, req.lang)
    except KeyError:
        raise HTTPException(status_code=404, detail="Pehle video load karo")
    except rag.TranslationError as e:
        raise HTTPException(status_code=503, detail=f"Translation nahi ho saki: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcript nahi mil saki: {e}")
