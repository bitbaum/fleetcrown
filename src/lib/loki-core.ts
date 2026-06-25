/**
 * Loki chat core — SSOT for the assistant logic behind the app.
 *
 * Loki IS the OpenClaw agent (`main`) — the same brain + workspace memory as the
 * Telegram bot — reached over the gateway WebSocket (see openclaw-gateway.ts).
 * Groq remains only as a CLEARLY-LABELLED degraded fallback when the gateway is
 * down; we never silently pass Groq off as Loki.
 *
 * Returns `{ status, body }` — the /api/loki route wraps it in NextResponse;
 * in-process callers (the Loki messages route) read `body.text`.
 */
import { askGatewayAgent, isGatewayConfigured } from "@/lib/openclaw-gateway";
import { callGroqText, GROQ_FAST_MODEL } from "@/lib/groq";
import { APP_NAME } from "@/config/brand";

const LOKI_SYSTEM_PROMPT =
  `You are Loki, a helpful AI assistant inside ${APP_NAME} — a personal life operating system for builders. Be concise and direct.`;

// Degraded fallback when the OpenClaw gateway is unavailable.
async function callGroq(message: string): Promise<{ text: string; model: string }> {
  const text = await callGroqText(message, {
    systemPrompt: LOKI_SYSTEM_PROMPT,
    maxTokens: 1024,
    timeoutMs: 30_000,
  });
  return { text, model: `groq/${GROQ_FAST_MODEL}` };
}

export type AskLokiResult = { status: number; body: Record<string, unknown> };

/**
 * Ask Loki a question — the real OpenClaw agent via the gateway, with Groq as a
 * labelled degraded fallback. `sessionKey` lets callers keep a per-conversation
 * web thread; all web sessions share the same agent (`main`) and its memory.
 */
export async function askLoki(message: string, opts?: { sessionKey?: string }): Promise<AskLokiResult> {
  // Real Loki: the OpenClaw agent (same brain + memory as Telegram).
  if (isGatewayConfigured()) {
    const res = await askGatewayAgent(message, { sessionKey: opts?.sessionKey });
    if (res.ok) {
      return {
        status: 200,
        body: { ok: true, text: res.text ?? "", model: res.model ?? "openclaw/main", durationMs: res.durationMs ?? 0 },
      };
    }
    console.error("[loki] gateway agent failed:", res.error);
    if (!process.env.GROQ_API_KEY) {
      return { status: 503, body: { error: `Loki is offline — ${res.error}.` } };
    }
    console.warn("[loki] degraded: falling back to Groq");
  }

  // Groq fallback — DEGRADED, labelled `via: "groq-fallback"` (not the real Loki brain).
  try {
    const { text, model } = await callGroq(message);
    return { status: 200, body: { ok: true, text, model, durationMs: 0, via: "groq-fallback" } };
  } catch (e) {
    // Surface the actual Groq cause so the user can act (rotate key / wait out
    // the rate limit) instead of a generic "unavailable" wall.
    const raw = e instanceof Error ? e.message : String(e);
    const hint = /\b401\b|invalid.api.key/i.test(raw) ? "Groq API key is invalid"
              : /\b429\b/.test(raw)                  ? "Groq rate-limited — try again shortly"
              : /\b5\d\d\b/.test(raw)                ? "Groq server error"
              : /timeout|abort/i.test(raw)           ? "Groq timed out"
              : `Loki is unavailable right now (${raw.slice(0, 80)})`;
    console.error("[loki] Groq fallback failed:", raw);
    return { status: 503, body: { error: `Loki is offline — ${hint}.` } };
  }
}
