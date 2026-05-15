/**
 * Shared Groq API client — single source of truth for the model name and call pattern.
 * Both the dispatch strategist and the prompt-merge route use this.
 */

export const GROQ_FAST_MODEL = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type GroqOptions = {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

/**
 * Call Groq with a single user prompt and return the completion text.
 * Throws if GROQ_API_KEY is missing, the request fails, or the timeout fires.
 */
export async function callGroqText(prompt: string, options: GroqOptions = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const { maxTokens = 200, temperature = 0.2, timeoutMs = 10_000 } = options;

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_FAST_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}
