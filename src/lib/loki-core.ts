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
import { getUserPreferences } from "@/db/queries/user-preferences";
import { buildLokiFleetContext } from "@/lib/loki-fleet-context";
import { APP_NAME } from "@/config/brand";

const LOKI_SYSTEM_PROMPT =
  `You are Loki, the assistant inside ${APP_NAME} — the captain's layer over a builder's fleet of AI agents and projects. ` +
  `When fleet context about the operator's projects is provided, treat it as current ground truth and answer specifically and accurately from it; if a question falls outside it, say so rather than inventing detail. Be concise and direct.`;

// The user's Settings → Voice preference, layered onto whichever brain answers.
// SSOT for turning that free-text instruction into a directive — applied to both
// the Groq fallback (system prompt) and the gateway agent (message preface) so
// the voice holds no matter which path serves the turn.
function voiceClause(voice: string | null | undefined): string {
  const v = voice?.trim();
  return v ? ` Adopt this writing voice in your reply: ${v}` : "";
}

/**
 * True when the gateway's text is not a real answer — empty, or the OpenClaw
 * "incomplete turn" marker a flaky/thinking model produces (payloads=0). Callers
 * treat these as failures and fall back rather than surfacing them to the user.
 */
function isUnusableGatewayText(text: string): boolean {
  const t = text.trim();
  return t.length === 0 || /couldn'?t generate a response/i.test(t);
}

/**
 * True when a modest model degenerated into restating the injected fleet index
 * (a bulleted list of most/all projects) instead of answering — observed with
 * gemini-flash on fleet-wide questions. Eight+ `- **Name**` bullets is a listing,
 * not a focused answer; treat it as unusable so we fall back to a model that
 * actually answers (Groq handles these well). Belt to the prompt's suspenders.
 */
function looksLikeFleetEcho(text: string): boolean {
  const bullets = text.match(/^\s*[-*]\s+\*\*[^*\n]+\*\*/gm);
  return (bullets?.length ?? 0) >= 8;
}

// Degraded fallback when the OpenClaw gateway is unavailable.
async function callGroq(message: string, voice: string | null): Promise<{ text: string; model: string }> {
  const text = await callGroqText(message, {
    systemPrompt: LOKI_SYSTEM_PROMPT + voiceClause(voice),
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
export async function askLoki(message: string, opts?: { sessionKey?: string; userId?: string }): Promise<AskLokiResult> {
  // Resolve the caller's writing-voice preference + fleet context once. The
  // fleet context (all projects + RAG detail) is what makes Loki "on top of"
  // the operator's work rather than a generic chat — see loki-fleet-context.
  // Both are best-effort: a slow/failed lookup degrades to plain Loki, never a
  // broken turn.
  const [voice, fleetContext] = await Promise.all([
    opts?.userId ? getUserPreferences(opts.userId).then((p) => p.writingVoice).catch(() => null) : Promise.resolve(null),
    opts?.userId ? buildLokiFleetContext(opts.userId, message).catch(() => "") : Promise.resolve(""),
  ]);

  // The message the brain actually sees: fleet context (read-only background)
  // ahead of the operator's question. Used by both the gateway and Groq paths
  // so Loki answers with project knowledge regardless of which one serves it.
  const contextualMessage = fleetContext ? `${fleetContext}\n\n---\n\n${message}` : message;

  // Real Loki: the OpenClaw agent (same brain + memory as Telegram). The voice
  // rides in as a one-line preface so the shared `main` agent honours it per-turn
  // without mutating its own persistent personality.
  if (isGatewayConfigured()) {
    const v = voice?.trim();
    const prefaced = v ? `[Voice for this reply — ${v}]\n\n${contextualMessage}` : contextualMessage;
    const res = await askGatewayAgent(prefaced, { sessionKey: opts?.sessionKey });
    const text = (res.text ?? "").trim();
    // The gateway can return ok=true with EMPTY or "couldn't generate a
    // response" text when the underlying model flakes (e.g. a thinking model
    // that emits no final payload — observed with gemini-2.5-pro on
    // reasoning-heavy prompts). Passing that through would surface a broken
    // answer as Loki's. Treat it as a failure and fall back — so Loki stays
    // useful even when the model isn't.
    if (res.ok && !isUnusableGatewayText(text) && !looksLikeFleetEcho(text)) {
      return {
        status: 200,
        body: { ok: true, text, model: res.model ?? "openclaw/main", durationMs: res.durationMs ?? 0 },
      };
    }
    const reason = !res.ok
      ? (res.error ?? "gateway error")
      : looksLikeFleetEcho(text)
        ? "the model restated the fleet instead of answering"
        : "the model returned an empty/incomplete response";
    console.error("[loki] gateway unusable:", reason);
    if (!process.env.GROQ_API_KEY) {
      return { status: 503, body: { error: `Loki is offline — ${reason}.` } };
    }
    console.warn("[loki] degraded: falling back to Groq");
  }

  // Groq fallback — DEGRADED, labelled `via: "groq-fallback"` (not the real Loki brain).
  // Still gets the fleet context so a degraded Loki is at least project-aware.
  try {
    const { text, model } = await callGroq(contextualMessage, voice);
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
