import ReactMarkdown from "react-markdown";

export default function Message({ role, text, sources, followups, onSeek, onAsk, showFollowups }) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] ${isUser ? "" : "w-full"}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser ? "whitespace-pre-wrap bg-red-600 text-white" : "bg-neutral-900 text-neutral-100"
          }`}
        >
          {isUser ? text : <div className="md"><ReactMarkdown>{text}</ReactMarkdown></div>}

          {sources?.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
              <span className="text-xs text-neutral-400">Sources:</span>
              {sources.map((s) => (
                <button
                  key={s.seconds}
                  onClick={() => onSeek(s.seconds)}
                  className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-red-300 hover:bg-neutral-700"
                >
                  ▶ {s.time}
                </button>
              ))}
            </div>
          )}
        </div>

        {showFollowups && followups?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {followups.map((q) => (
              <button
                key={q}
                onClick={() => onAsk(q)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-left text-xs text-neutral-300 hover:border-red-500 hover:text-red-300"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
