export default function OverviewCard({ overview, failed, onAsk, disabled }) {
  if (failed) {
    return (
      <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
        Summary abhi nahi ban saki (model busy ho sakta hai), lekin aap seedha sawal pooch sakte hain.
      </p>
    );
  }
  if (!overview) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Is video me kya hai
        </h3>
        <p className="text-sm leading-relaxed text-neutral-200">{overview.summary}</p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Ye puch kar dekho
        </h3>
        <div className="flex flex-wrap gap-2">
          {overview.questions.map((q) => (
            <button
              key={q}
              onClick={() => onAsk(q)}
              disabled={disabled}
              className="rounded-full bg-neutral-800 px-3 py-1.5 text-left text-xs text-red-300 hover:bg-neutral-700 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
