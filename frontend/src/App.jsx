import { useEffect, useRef, useState } from "react";
import UrlInput from "./components/UrlInput.jsx";
import VideoCard from "./components/VideoCard.jsx";
import OverviewCard from "./components/OverviewCard.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import LoadingSteps from "./components/LoadingSteps.jsx";
import ErrorBox from "./components/ErrorBox.jsx";
import TranscriptPanel from "./components/TranscriptPanel.jsx";
import { loadVideo, askQuestion, getOverview } from "./api.js";

// Turn raw backend errors into friendly messages
function friendlyError(message) {
  if (message.includes("Could not get a transcript")) {
    return {
      message: "Couldn't get a transcript for this video.",
      hint: "It may have no captions, be private or very long, or YouTube may be blocking the server. Try another public, shorter video.",
    };
  }
  if (message.includes("Translation failed")) {
    return {
      message: "Couldn't translate the transcript.",
      hint: message.replace("Translation failed:", "").trim() || "Gemini may be busy. Please try again in a bit.",
    };
  }
  if (message.includes("Couldn't reach the server")) {
    return {
      message: "Couldn't reach the server.",
      hint: "The free backend may be waking up (it can take up to a minute). Please try again shortly.",
    };
  }
  if (message.includes("Too many requests")) {
    return { message: "Too many requests.", hint: "Please wait a few minutes and try again." };
  }
  return { message: "Something went wrong.", hint: message };
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


  // Refresh the summary and suggested questions when the answer language changes
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
        setOverviewFailed(true);   // chat still works if the summary fails
      }
    } catch (e) {
      setError(friendlyError(e.message));
    } finally {
      setStage(null);
    }
  };

  const handleSend = async (question) => {
    if (!video || thinking) return;

    // Chat memory: send the last 6 messages (excluding errors) to the backend
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
          Ask questions about any YouTube video. Answers come with clickable timestamps.
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
                This video had no captions, so Gemini transcribed the <b>audio</b>.
                It may contain mistakes, and timestamps can be slightly off.
              </p>
            )}
            {video.translated && (
              <p className="rounded-xl border border-blue-900 bg-blue-950/40 px-4 py-3 text-sm text-blue-200">
                This video was in <b>{video.source_language_name}</b>. The transcript has been translated to English
                {video.partial ? " (some lines could not be translated)" : ""}. Open the{" "}
                <button className="underline" onClick={() => setRightTab("transcript")}>Transcript tab</button>{" "}
                to read it in English, Roman Urdu or the original.
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
