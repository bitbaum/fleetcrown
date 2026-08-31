/**
 * Provider-agnostic image analysis — replaces the hardcoded Groq vision call.
 *
 * Walks `usableVisionChain()` and returns the first real answer. "Real" is
 * doing work there: a model in this space can return HTTP 200 with EMPTY
 * content (observed with nvidia/nemotron-nano-12b-v2-vl), and a client that
 * accepts that reports a successful analysis of nothing — which reads to the
 * user as "the screenshot contained nothing notable" rather than as a failure.
 * Empty is therefore treated as a failed link and the chain continues.
 *
 * Every provider speaks the OpenAI chat-completions multimodal shape, so this
 * is one request builder rather than a client per vendor.
 */
import { usableVisionChain } from "@/config/vision-models";
import { HTTP_TIMEOUT_XL_MS } from "@/lib/constants/time";

export type VisionImage = { mimeType: string; dataBase64: string; name?: string };

/** Providers reject `image/jpg`; normalise the one alias that shows up. */
function normalizeMime(mime: string): string {
  const m = mime.toLowerCase().trim();
  return m === "image/jpg" ? "image/jpeg" : m;
}

/** Most vision endpoints cap images per request; keep well inside every limit. */
const MAX_IMAGES = 5;

export type VisionResult = { text: string; model: string };

/**
 * Analyse images with the first model in the chain that answers.
 *
 * Throws only when EVERY link fails, with the per-link reasons joined — so the
 * caller can tell the user "no vision provider is configured" apart from "the
 * model rate-limited", which are very different things to act on.
 */
export async function analyzeImages(input: {
  prompt: string;
  images: VisionImage[];
  systemPrompt?: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<VisionResult> {
  const chain = usableVisionChain();
  if (chain.length === 0) {
    throw new Error(
      "no vision provider configured (set OPENROUTER_API_KEY, or GROQ_VISION_MODEL if Groq has one again)",
    );
  }

  const content = [
    { type: "text", text: input.prompt },
    ...input.images.slice(0, MAX_IMAGES).map((img) => ({
      type: "image_url",
      image_url: { url: `data:${normalizeMime(img.mimeType)};base64,${img.dataBase64}` },
    })),
  ];
  const messages = [
    ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
    { role: "user", content },
  ];

  const failures: string[] = [];
  for (const { provider, model } of chain) {
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env[provider.keyEnv]}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: input.maxTokens ?? 900 }),
        signal: AbortSignal.timeout(input.timeoutMs ?? HTTP_TIMEOUT_XL_MS),
      });

      if (!res.ok) {
        failures.push(`${model}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = (data.choices?.[0]?.message?.content ?? "").trim();
      if (!text) {
        // 200 with no content — a real, observed shape. Not an answer.
        failures.push(`${model}: empty response`);
        continue;
      }
      return { text, model: `${provider.id}/${model}` };
    } catch (e) {
      failures.push(`${model}: ${e instanceof Error ? e.message.slice(0, 60) : "error"}`);
    }
  }

  throw new Error(`all vision models failed — ${failures.join("; ")}`);
}
