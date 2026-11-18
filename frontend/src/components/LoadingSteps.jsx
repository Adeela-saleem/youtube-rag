const STEPS = [
  { key: "transcript", label: "Transcript nikal rahi hoon (Hindi/doosri zubaan ho to English me translate hogi, 1-2 minute lag sakte hain)" },
  { key: "summary", label: "Video samajh rahi hoon (summary + sawal)" },
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
