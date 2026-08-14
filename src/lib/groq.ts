/**
 * Shared Groq API client — single source of truth for the model name and call pattern.
 * Dispatch strategist, prompt-merge, and Loki all use this.
 */

import { HTTP_TIMEOUT_SHORT_MS, HTTP_TIMEOUT_LONG_MS } from "@/lib/constants/time";

export const GROQ_FAST_MODEL = "llama-3.3-70b-versatile";
export const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

type GroqOptions = {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  systemPrompt?: string;
  /** Override the model (defaults to GROQ_FAST_MODEL). Lets a verifier run on a
   *  different model than the generator — the first step of cross-model checking. */
  model?: string;
};

/**
 * Call Groq and return the completion text.
 * Throws if GROQ_API_KEY is missing, the request fails, or the timeout fires.
 */
export async function callGroqText(prompt: string, options: GroqOptions = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const { maxTokens = 200, temperature = 0.2, timeoutMs = HTTP_TIMEOUT_SHORT_MS, systemPrompt, model = GROQ_FAST_MODEL } = options;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  // Keep the body: Groq's 429 says WHICH limit was hit (tokens-per-minute vs
  // per-day) and how long to wait. Without it a rate-limited caller cannot tell
  // "retry in 12s" from "you are out for the day".
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`groq ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

export async function callGroqTranscribe(audio: Blob, mimeType = "audio/webm"): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const form = new FormData();
  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm";
  form.append("file", audio, `audio.${ext}`);
  form.append("model", GROQ_WHISPER_MODEL);

  const res = await fetch(GROQ_AUDIO_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_LONG_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`groq transcribe ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { text?: string };
  return (data.text ?? "").trim();
}
