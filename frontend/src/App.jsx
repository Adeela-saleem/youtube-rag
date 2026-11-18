import { useEffect, useRef, useState } from "react";
import UrlInput from "./components/UrlInput.jsx";
import VideoCard from "./components/VideoCard.jsx";
import OverviewCard from "./components/OverviewCard.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import LoadingSteps from "./components/LoadingSteps.jsx";
import ErrorBox from "./components/ErrorBox.jsx";
import TranscriptPanel from "./components/TranscriptPanel.jsx";
import { loadVideo, askQuestion, getOverview } from "./api.js";

// Backend ke technical errors ko friendly message me badalta hai
function friendlyError(message) {
  if (message.includes("Transcript nahi mili")) {
    return {
      message: "Is video ka transcript nahi mil paya.",
      hint: "Captions nahi mile aur audio se bhi transcript nahi ban saki. Video private ya bohat lambi ho sakti hai, ya server par YouTube ne rok diya ho. Koi doosri (public, chhoti) video try karo.",
    };
  }
  if (message.includes("Translation nahi")) {
    return {
      message: "Transcript translate nahi ho saki.",
      hint: "Gemini abhi busy ho sakta hai. Thori der baad dobara try karo.",
    };
  }
  if (message.includes("connect nahi")) {
    return {
      message: "Server se connect nahi ho paya.",
      hint: "Check karo ke backend (uvicorn) chal raha hai.",
    };
  }
  return { message: "Kuch galat ho gaya.", hint: message };
}

export default function App() {
  const [lastUrl, setLastUrl] = useState("");
  const [video, setVideo] = useState(null);          // { video_id, title, chunks }
  const [stage, setStage] = useState(null);          // null | "transcript" | "summary"
  const [overview, setOverview] = useState(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [error, setError] = useState(null);
  const [rightTab, setRightTab] = useState("chat");   // "chat" | "transcript"


  // Jawab ki zubaan badle to summary aur suggested sawal bhi us zubaan me
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (!video) return;
    getOverview(video.video_id, language).then(setOverview).catch(() => {});
  }, [language]);

  const handleLoad = async (url) => {
    setLastUrl(url);
    setError(null);
    setVideo(null);
    setOverview(null);
    setOverviewFailed(false);
    setMessages([]);
    setStartAt(0);
    setAutoplay(false);
    setRightTab("chat");

    try {
      setStage("transcript");
      const v = await loadVideo(url);
      setVideo(v);

      setStage("summary");
      try {
        setOverview(await getOverview(v.video_id, language));
      } catch {
        setOverviewFailed(true);   // summary fail ho to bhi chat chalegi
      }
    } catch (e) {
      setError(friendlyError(e.message));
    } finally {
      setStage(null);
    }
  };

  const handleSend = async (question) => {
    if (!video || thinking) return;

    // Chat memory: pichle 6 messages (error wale messages chhod ke) backend ko bhejo
    const history = messages
      .filter((m) => !m.text.startsWith("⚠️"))
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((m) => [...m, { role: "user", text: question }]);
    setThinking(true);
    try {
      const data = await askQuestion(video.video_id, question, history, language);
      setMessages((m) => [
        ...m,
        { role: "bot", text: data.answer, sources: data.sources, followups: data.followups },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: "bot", text: `⚠️ ${e.message}` }]);
    } finally {
      setThinking(false);
    }
  };

  const handleSeek = (seconds) => {
    setStartAt(seconds);
    setAutoplay(true);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">🎥 YouTube RAG Chatbot</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Kisi bhi YouTube video se sawal pucho, jawab timestamps ke saath milega.
        </p>
      </header>

      <UrlInput onLoad={handleLoad} loading={!!stage} />

      {error && <ErrorBox {...error} onRetry={lastUrl ? () => handleLoad(lastUrl) : null} />}

      {stage === "transcript" && <LoadingSteps stage="transcript" />}

      {video && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: video + summary + suggested questions */}
          <div className="space-y-5">
            <VideoCard video={video} startAt={startAt} autoplay={autoplay} />
            {video.ai_transcribed && (
              <p className="rounded-xl border border-yellow-900 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-200">
                Is video ke captions available nahi the, isliye Gemini ne <b>audio sun kar</b> transcript banayi hai.
                Isme galtiyan ho sakti hain aur timestamps thore idhar udhar ho sakte hain.
              </p>
            )}
            {video.translated && (
              <p className="rounded-xl border border-blue-900 bg-blue-950/40 px-4 py-3 text-sm text-blue-200">
                Ye video <b>{video.source_language_name}</b> me thi. Transcript English me translate ho gayi hai
                {video.partial ? " (kuch lines translate nahi ho saein)" : ""}. Roman Urdu ya original
                dekhne ke liye <button className="underline" onClick={() => setRightTab("transcript")}>Transcript tab</button> kholo.
              </p>
            )}
            {stage === "summary" && <LoadingSteps stage="summary" />}
            <OverviewCard
              overview={overview}
              failed={overviewFailed}
              onAsk={handleSend}
              disabled={thinking}
            />
          </div>

          {/* Right: chat / transcript */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {[["chat", "💬 Chat"], ["transcript", "📝 Transcript"]].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setRightTab(k)}
                  className={`rounded-full px-4 py-1.5 text-sm ${
                    rightTab === k ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={rightTab === "chat" ? "" : "hidden"}>
              <ChatWindow
                messages={messages}
                onSend={handleSend}
                onSeek={handleSeek}
                onClear={() => setMessages([])}
                thinking={thinking}
                language={language}
                onLanguage={setLanguage}
              />
            </div>
            <div className={rightTab === "transcript" ? "" : "hidden"}>
              <TranscriptPanel key={video.video_id} video={video} onSeek={handleSeek} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
