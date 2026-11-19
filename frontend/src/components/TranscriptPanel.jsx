import { useEffect, useMemo, useState } from "react";
import { getTranscript } from "../api.js";

export default function TranscriptPanel({ video, onSeek }) {
  const tabs = [
    { key: "english", label: "English" },
    { key: "roman_urdu", label: "Roman Urdu" },
    ...(video.translated ? [{ key: "original", label: `Original (${video.source_language_name})` }] : []),
  ];

  const [tab, setTab] = useState("english");
  const [cache, setCache] = useState({});      // { english: {lines, partial}, ... }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (cache[tab]) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getTranscript(video.video_id, tab)
      .then((data) => !cancelled && setCache((c) => ({ ...c, [tab]: data })))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [tab, video.video_id]);

  const data = cache[tab];
  const lines = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return q ? data.lines.filter((l) => l.text.toLowerCase().includes(q)) : data.lines;
  }, [data, query]);

  return (
    <div className="flex h-[560px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950 lg:h-[calc(100vh-11rem)] lg:min-h-[480px]">
      <div className="space-y-2 border-b border-neutral-800 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1 text-xs ${
                tab === t.key ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the transcript..."
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs outline-none focus:border-red-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <p className="p-3 text-sm text-neutral-400">
            {tab === "roman_urdu"
              ? "Converting to Roman Urdu... (can take 1-2 minutes for long videos)"
              : "Loading..."}
          </p>
        )}
        {error && <p className="p-3 text-sm text-red-300">{error}</p>}
        {data?.partial && (
          <p className="mb-2 rounded-lg bg-yellow-950/40 p-2 text-xs text-yellow-200/80">
            Some lines could not be translated (the model was busy) and are shown in the original language.
          </p>
        )}
        {!loading && data && lines.length === 0 && (
          <p className="p-3 text-sm text-neutral-500">No matches found.</p>
        )}
        <div className="space-y-1">
          {lines.map((l, i) => (
            <button
              key={`${l.start}-${i}`}
              onClick={() => onSeek(l.start)}
              className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-900"
            >
              <span className="shrink-0 text-xs text-red-300">{l.time}</span>
              <span className="text-neutral-200">{l.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
