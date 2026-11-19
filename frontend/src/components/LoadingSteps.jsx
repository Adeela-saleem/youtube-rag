const STEPS = [
  { key: "transcript", label: "Fetching the transcript (non-English videos are translated to English, which can take 1-2 minutes)" },
  { key: "summary", label: "Understanding the video (summary + suggested questions)" },
];

export default function LoadingSteps({ stage }) {
  // stage: "transcript" | "summary"
  const current = STEPS.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                done
                  ? "bg-green-600 text-white"
                  : active
                  ? "animate-pulse bg-red-600 text-white"
                  : "bg-neutral-800 text-neutral-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={done || active ? "text-neutral-100" : "text-neutral-500"}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
