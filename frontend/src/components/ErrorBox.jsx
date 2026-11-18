export default function ErrorBox({ message, hint, onRetry }) {
  return (
    <div className="rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm">
      <p className="font-medium text-red-300">{message}</p>
      {hint && <p className="mt-1 text-red-200/70">{hint}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium hover:bg-red-500"
        >
          Dobara try karo
        </button>
      )}
    </div>
  );
}
