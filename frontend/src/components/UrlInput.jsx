import { useState } from "react";

export default function UrlInput({ onLoad, loading }) {
  const [url, setUrl] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (url.trim()) onLoad(url.trim());
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a YouTube video link..."
        className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-red-500"
      />
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="rounded-xl bg-red-600 px-5 py-3 text-sm font-medium hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Loading..." : "Load video"}
      </button>
    </form>
  );
}
