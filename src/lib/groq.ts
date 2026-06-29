/**
 * Shared Groq API client — single source of truth for the model name and call pattern.
 * Dispatch strategist, prompt-merge, and Loki all use this.
 */

export const GROQ_FAST_MODEL = "llama-3.3-70b-versatile";
export const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
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

  const { maxTokens = 200, temperature = 0.2, timeoutMs = 10_000, systemPrompt, model = GROQ_FAST_MODEL } = options;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

type GroqVisionImage = { mimeType: string; dataBase64: string; name?: string };

function normalizeImageMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "image/jpg" || m === "image/jpeg") return "image/jpeg";
  return m;
}

type GroqVisionOptions = {
  prompt: string;
  images: GroqVisionImage[];
  systemPrompt?: string;
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
};

/**
 * Multimodal Groq call — up to 5 images per request (Groq vision limit).
 * Images must be base64 without the data: prefix.
 */
export async function callGroqVision(options: GroqVisionOptions): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const {
    prompt,
    images,
    systemPrompt,
    maxTokens = 900,
    timeoutMs = 45_000,
    model = GROQ_VISION_MODEL,
  } = options;

  if (images.length === 0) throw new Error("vision requires at least one image");
  if (images.length > 5) throw new Error("vision supports at most 5 images");

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: prompt },
  ];
  for (const img of images) {
    const mime = normalizeImageMime(img.mimeType);
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${img.dataBase64}` },
    });
  }

  const messages: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content });

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`groq vision ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

/**
 * Transcribe audio via Groq's Whisper API.
 * Used as the cloud fallback when local Whisper is unavailable (cloud host/remote).
 * Returns the transcribed text. Throws on failure.
 */
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
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`groq transcribe ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { text?: string };
  return (data.text ?? "").trim();
}
