import { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";

const LANGUAGES = [
  { value: "auto", label: "Auto (same as question)" },
  { value: "english", label: "English" },
  { value: "roman_urdu", label: "Roman Urdu" },
  { value: "hindi", label: "Hindi" },
  { value: "urdu", label: "Urdu" },
];

export default function ChatWindow({
  messages, onSend, onSeek, onClear, thinking, language, onLanguage,
}) {
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const submit = (e) => {
    e.preventDefault();
    if (!input.trim() || thinking) return;
    onSend(input.trim());
    setInput("");
  };

  const lastIndex = messages.length - 1;

  return (
    <div className="flex h-[560px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950 lg:h-[calc(100vh-11rem)] lg:min-h-[480px]">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-2.5">
        <h3 className="text-sm font-medium">Chat</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            Answer in:
            <select
              value={language}
              onChange={(e) => onLanguage(e.target.value)}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-red-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>
          {messages.length > 0 && (
            <button onClick={onClear} className="text-xs text-neutral-400 hover:text-neutral-200">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-10 space-y-2 text-center text-sm text-neutral-500">
            <p>Video loaded 🎉</p>
            <p>Click a suggested question on the left, or type your own below.</p>
            <p className="text-xs">Tip: you can also say "I didn't understand" or "give me an example".</p>
          </div>
        )}
        {messages.map((m, i) => (
          <Message
            key={i}
            {...m}
            onSeek={onSeek}
            onAsk={onSend}
            showFollowups={i === lastIndex && !thinking}
          />
        ))}
        {thinking && <p className="text-sm text-neutral-500">Thinking...</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-neutral-800 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the video..."
          className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm outline-none focus:border-red-500"
        />
        <button
          type="submit"
          disabled={thinking || !input.trim()}
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
