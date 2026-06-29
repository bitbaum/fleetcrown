/**
 * Vision preflight for Loki image attachments — Groq Llama 4 Scout turns
 * screenshots into actionable text the chat brain and terminal agents can use.
 */
import { callGroqVision } from "@/lib/groq";
import type { ImageAttachment } from "@/lib/loki/attachments";

const SYSTEM = `You analyze UI screenshots and error states for a developer using an AI agent fleet.
Be concrete: visible bugs, layout issues, clipped elements, error messages, and what to change in code.
No hype, no preamble. Use short paragraphs or bullets.`;

export async function describeAttachedImages(
  images: ImageAttachment[],
  userText: string,
): Promise<string> {
  if (images.length === 0) return "";

  const question =
    userText.trim() ||
    "The user attached screenshot(s) without a question. Describe what's wrong or notable and suggest fixes.";

  try {
    const analysis = await callGroqVision({
      systemPrompt: SYSTEM,
      prompt: question,
      images: images.map((img) => ({
        mimeType: img.mimeType,
        dataBase64: img.dataBase64,
        name: img.name,
      })),
      maxTokens: 900,
      timeoutMs: 45_000,
    });

    const blocks = images.map((img) => img.name).join(", ");
    return `\n\n--- Attached image analysis (${blocks}) ---\n${analysis}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "vision failed";
    return `\n\n[Could not analyze attached image(s): ${msg}. Describe the issue in words or try a smaller screenshot.]`;
  }
}
