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
import { buildGroundedTurn, directiveEvidence } from "@/lib/agent/context";
import { verifyAnswer, buildRepairPrompt, type Violation } from "@/lib/agent/core/verify";
import { NO_BASIS } from "@/lib/agent/core/contract";
import type { Fact } from "@/lib/agent/core/facts";
import { APP_NAME } from "@/config/brand";
import { HTTP_TIMEOUT_LONG_MS } from "@/lib/constants/time";

const LOKI_SYSTEM_PROMPT =
  `You are Loki, the assistant inside ${APP_NAME} — the captain's layer over a builder's fleet of AI agents and projects. ` +
  `When fleet context about the operator's projects is provided, treat it as current ground truth and answer specifically and accurately from it; if a question falls outside it, say so rather than inventing detail. Be concise and direct.`;

/**
 * Ground-truth of what Loki can actually DO, injected into every turn's context.
 *
 * Why a message preface and not just the system prompt: the real Loki is the
 * external OpenClaw agent reached over the gateway (askGatewayAgent) — it never
 * sees LOKI_SYSTEM_PROMPT (that only shapes the Groq fallback). The only reliable
 * way to bind the real brain per-turn is to prepend this to the message, exactly
 * as fleet context is. Kept terse to limit per-turn token cost.
 *
 * This exists because Loki once told the operator a "security sandbox hard-blocked"
 * a calendar write and invented an Approve button that would book it — both false.
 * The truth: Loki has no direct external powers; it only proposes to the queue.
 */
const LOKI_CAPABILITIES =
  `CAPABILITIES — ground truth; never exceed or invent beyond this: You have NO ability to directly change the operator's Google Calendar, send messages/emails, or take any external action yourself. Your only lever is the ${APP_NAME} approval queue — you PROPOSE actions (send a Telegram message, send an email, create a calendar event, create a commitment, update a project profile) and the operator must approve each one before anything happens. An approved calendar event is booked by running \`gog calendar create\` on the operator's own machine, so it lands only after they approve AND their local runtime is connected — it is not written the instant you propose it. Never claim a "security sandbox" or similar blocked you, and never report a result (an event booked, a message sent) you did not actually receive confirmation of. If you cannot do something, say so plainly and, when useful, propose the matching queue action instead.`;

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
    timeoutMs: HTTP_TIMEOUT_LONG_MS,
  });
  return { text, model: `groq/${GROQ_FAST_MODEL}` };
}

export type AskLokiResult = { status: number; body: Record<string, unknown> };

/**
 * Per-turn grounding report, returned to the client alongside the answer.
 *
 * Surfaced rather than swallowed on purpose. When a claim survives the repair
 * pass the operator has to be able to SEE that this turn is suspect — the
 * failure this harness exists to prevent was not that Loki was wrong, it was
 * that being wrong looked exactly like being right. A visible flag restores the
 * distinction even when the model cannot.
 *
 * `checked: false` means the turn had no records to check against (e.g. an
 * anonymous caller), which is honestly different from "checked and clean".
 */
function groundingMeta(factCount: number, violations: Violation[]) {
  return {
    checked: factCount > 0,
    ok: violations.length === 0,
    factCount,
    unsupported: violations.map((v) => ({ kind: v.kind, text: v.text })),
  };
}

/**
 * Ask Loki a question — the real OpenClaw agent via the gateway, with Groq as a
 * labelled degraded fallback. `sessionKey` lets callers keep a per-conversation
 * web thread; all web sessions share the same agent (`main`) and its memory.
 */
export async function askLoki(message: string, opts?: { sessionKey?: string; userId?: string }): Promise<AskLokiResult> {
  // Resolve the caller's writing-voice preference + the grounded turn once.
  // The grounded turn (typed records + computed answers + the contract) is what
  // makes Loki "on top of" the operator's work rather than a generic chat.
  // Both are best-effort: a slow/failed lookup degrades to plain Loki, never a
  // broken turn.
  const [voice, grounded] = await Promise.all([
    opts?.userId ? getUserPreferences(opts.userId).then((p) => p.writingVoice).catch(() => null) : Promise.resolve(null),
    opts?.userId
      ? buildGroundedTurn(opts.userId, message).catch(() => null)
      : Promise.resolve(null),
  ]);

  const facts: Fact[] = grounded?.facts ?? [];
  const evidence = grounded ? directiveEvidence(grounded.directives) : [];

  // The message the brain actually sees: capability ground-truth + the grounded
  // context (both read-only background) ahead of the operator's question. Used
  // by the gateway AND Groq paths so Loki answers from records and, critically,
  // never over-claims — regardless of which one serves the turn.
  const background = grounded?.context ? `${LOKI_CAPABILITIES}\n\n---\n\n${grounded.context}` : LOKI_CAPABILITIES;
  const contextualMessage = `${background}\n\n---\n\n${message}`;

  /**
   * Check an answer and, if it makes unsupported claims, give the model exactly
   * one chance to delete them.
   *
   * One retry, not a loop: the repair asks the model to REMOVE claims, not to
   * find better ones, so a model that fails twice is not going to succeed on a
   * third pass — it is going to burn the operator's latency. What survives a
   * failed repair is returned WITH its violations attached rather than
   * suppressed, because a wrong answer the operator can see is flagged is
   * strictly safer than a wrong answer that looks clean.
   */
  async function groundOrRepair(
    text: string,
    regenerate: (repair: string) => Promise<string>,
  ): Promise<{ text: string; violations: Violation[] }> {
    if (facts.length === 0) return { text, violations: [] };
    const first = verifyAnswer({ answer: text, facts, userMessage: message, extraEvidence: evidence });
    if (first.ok) return { text, violations: [] };

    console.warn(
      "[loki] ungrounded claims, repairing:",
      first.violations.map((v) => `${v.kind}:${v.text}`).join(", ").slice(0, 300),
    );
    const repaired = (await regenerate(buildRepairPrompt(first.violations, NO_BASIS)).catch(() => "")).trim();
    if (!repaired) return { text, violations: first.violations };

    const second = verifyAnswer({ answer: repaired, facts, userMessage: message, extraEvidence: evidence });
    return { text: repaired, violations: second.violations };
  }

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
      // Ground the answer before it reaches the operator. The repair re-asks
      // the SAME agent on the SAME session, so its own prior turn is in scope
      // and it is editing rather than starting over.
      const checked = await groundOrRepair(text, async (repair) => {
        const again = await askGatewayAgent(repair, { sessionKey: opts?.sessionKey });
        return again.ok ? (again.text ?? "") : "";
      });
      return {
        status: 200,
        body: {
          ok: true,
          text: checked.text,
          model: res.model ?? "openclaw/main",
          durationMs: res.durationMs ?? 0,
          grounding: groundingMeta(facts.length, checked.violations),
        },
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
  // Still gets the grounded context, and is still verified: the fallback path is
  // a SMALLER model, so it is the path most likely to fabricate and the last one
  // that should skip the check.
  try {
    const { text, model } = await callGroq(contextualMessage, voice);
    const checked = await groundOrRepair(text, async (repair) => {
      // Groq is stateless here, so the repair must carry the answer being
      // repaired — there is no session for it to refer back to.
      const { text: fixed } = await callGroq(
        `${contextualMessage}\n\n---\n\nYour previous answer:\n${text}\n\n---\n\n${repair}`,
        voice,
      );
      return fixed;
    });
    return {
      status: 200,
      body: {
        ok: true,
        text: checked.text,
        model,
        durationMs: 0,
        via: "groq-fallback",
        grounding: groundingMeta(facts.length, checked.violations),
      },
    };
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
