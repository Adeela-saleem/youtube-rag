const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Is the backend running?");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Something went wrong");
  return data;
}

export const loadVideo = (url) => post("/load", { url });
export const getOverview = (video_id, language = "auto") => post("/overview", { video_id, language });
export const getTranscript = (video_id, lang) => post("/transcript", { video_id, lang });
export const askQuestion = (video_id, question, history = [], language = "auto") =>
  post("/chat", { video_id, question, history, language });
