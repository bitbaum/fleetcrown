/**
 * Ivy chat core — SSOT for the openclaw-then-Groq assistant logic.
 *
 * Extracted from the /api/ivy route so server-side callers (the Loki messages
 * route) can ask Ivy WITHOUT a self-HTTP round-trip. Returns `{ status, body }`
 * — the route wraps it in NextResponse; in-process callers read `body.text`.
 */
import { runTool } from "@/lib/tools";
import { callGroqText, GROQ_FAST_MODEL } from "@/lib/groq";
import { APP_NAME } from "@/config/brand";

// openclaw agent --json output shape
type OpenclawResult = {
  status?: string;
  result?: {
    payloads?: Array<{ text: string; mediaUrl: string | null }>;
    meta?: { durationMs?: number; agentMeta?: { model?: string } };
  };
};

const IVY_SYSTEM_PROMPT =
  `You are Ivy, a helpful AI assistant inside ${APP_NAME} — a personal life operating system for builders. Be concise and direct.`;

// Direct Groq fallback when the local openclaw gateway is unavailable.
async function callGroq(message: string): Promise<{ text: string; model: string }> {
  const text = await callGroqText(message, {
    systemPrompt: IVY_SYSTEM_PROMPT,
    maxTokens: 1024,
    timeoutMs: 30_000,
  });
  return { text, model: `groq/${GROQ_FAST_MODEL}` };
}

export type AskIvyResult = { status: number; body: Record<string, unknown> };

/** Ask Ivy a question — openclaw gateway first, Groq fallback. */
export async function askIvy(message: string): Promise<AskIvyResult> {
  // Try openclaw gateway first
  if (process.env.OPENCLAW_GATEWAY_URL || process.env.OPENCLAW_ENABLED !== "false") {
    try {
      const safe = message.replace(/'/g, "'\\''");
      const result = await runTool(
        `openclaw agent --agent main --message '${safe}' --json`,
        90000,
      );

      if (result.ok) {
        try {
          const data: OpenclawResult = JSON.parse(result.data ?? "{}");
          const text = data?.result?.payloads?.[0]?.text ?? "";
          const model = data?.result?.meta?.agentMeta?.model ?? "";
          const durationMs = data?.result?.meta?.durationMs ?? 0;
          return { status: 200, body: { ok: true, text, model, durationMs } };
        } catch {
          return { status: 200, body: { ok: true, text: result.data ?? "" } };
        }
      }

      // openclaw failed — fall through to Groq if available
      const isTimeout = result.error?.includes("timeout");
      console.error("[ivy] openclaw failed:", result.error);
      if (!process.env.GROQ_API_KEY) {
        const friendly = isTimeout
          ? "Ivy timed out — the request took too long. Try again."
          : "Ivy is unavailable right now — please try again in a moment.";
        return { status: 500, body: { error: friendly } };
      }
      console.warn("[ivy] falling back to Groq");
    } catch (e) {
      console.error("[ivy] openclaw exception:", e);
      if (!process.env.GROQ_API_KEY) {
        return { status: 500, body: { error: String(e) } };
      }
    }
  }

  // Groq fallback
  try {
    const { text, model } = await callGroq(message);
    return { status: 200, body: { ok: true, text, model, durationMs: 0, via: "groq" } };
  } catch (e) {
    // Surface the actual Groq cause so the user can act (rotate key / wait
    // out rate limit / etc) instead of seeing the generic "unavailable" wall.
    // Mirrors the classification in /api/control/dispatch.
    const raw = e instanceof Error ? e.message : String(e);
    const hint = /\b401\b|invalid.api.key/i.test(raw) ? "Groq API key is invalid"
              : /\b429\b/.test(raw)                  ? "Groq rate-limited — try again shortly"
              : /\b5\d\d\b/.test(raw)                ? "Groq server error"
              : /timeout|abort/i.test(raw)           ? "Groq timed out"
              : `Ivy is unavailable right now (${raw.slice(0, 80)})`;
    console.error("[ivy] Groq fallback failed:", raw);
    return { status: 503, body: { error: `Ivy is offline — ${hint}.` } };
  }
}
