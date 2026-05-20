/**
 * POST /api/control/dispatch
 *
 * Strategist layer (v2, 2026-05-20): decides whether to drain the queue,
 * fire the canned next_best template, OR compose a context-aware prompt
 * body from session handoff + queue tail + recent commits + outcome
 * streak. The composed path is the answer to "the agent's auto-injected
 * prompts are dumb" — see content/thoughts/strategist-and-prompt-quality.md.
 *
 * Returns quickly (< 1.5s on Groq free tier; composed bodies add latency
 * proportional to maxTokens). Falls back to QUEUE when Groq is unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { callGroqText } from "@/lib/groq";
import { getApiUserId } from "@/lib/session";
import { getRecentOutcomes, type RecentOutcome } from "@/db/queries/orchestration-runs";
import { getBeaconSettings } from "@/db/queries/beacon-settings";

// Compact display: ✓ for success, ✗ for error/hang/timeout, ~ for partial, ✕ for user_abort.
const OUTCOME_GLYPH: Record<RecentOutcome["outcome"], string> = {
  success: "✓",
  partial: "~",
  error: "✗",
  hang: "✗",
  timeout: "✗",
  user_abort: "✕",
};
function streakLine(outcomes: RecentOutcome[]): string {
  return outcomes.map((o) => OUTCOME_GLYPH[o.outcome]).join("");
}

const HandoffSchema = z.object({
  done:   z.string().default(""),
  next:   z.string().default(""),
  health: z.string().default(""),
  tests:  z.string().default(""),
  todos:  z.string().default(""),
});

const DispatchBody = z.object({
  handoff:       HandoffSchema,
  queue:         z.array(z.string().trim().min(1)).max(20),
  projectName:   z.string().optional(),
  projectKey:    z.string().optional(),
  gitBranch:     z.string().optional(),
  recentCommits: z.array(z.string()).max(5).optional(),
});

export type DispatchAction = "queue" | "nextbest" | "composed" | "off";

export type DispatchResult = {
  action: DispatchAction;
  reason: string;
  /** Which inference path produced the decision. */
  source: "groq" | "health_gate" | "empty_queue" | "fallback" | "mode_gate";
  /** Strategist-composed prompt body when action="composed". The caller
   *  injects this as a custom prompt instead of firing the canned
   *  next_best template. Absent for queue / nextbest / off paths. */
  prompt?: string;
};

// ── Prompt construction ────────────────────────────────────────────────────

function buildPrompt(
  handoff: z.infer<typeof HandoffSchema>,
  queue: string[],
  projectName?: string,
  gitBranch?: string,
  recentCommits?: string[],
  recentOutcomes?: RecentOutcome[],
): string {
  const projectCtx = [
    projectName ? `Project: ${projectName}` : "",
    gitBranch   ? `Branch: ${gitBranch}`    : "",
  ].filter(Boolean).join("  |  ");

  // Strip leading hash so the model focuses on message content, not SHAs.
  // Raw format from GitState: "abc1234 2025-05-14: feat(x): add thing"
  const commitsSection = recentCommits && recentCommits.length > 0
    ? `\nRecent commits (newest first):\n${recentCommits.slice(0, 3).map((c) => `  • ${c.replace(/^[0-9a-f]+ /, "")}`).join("\n")}\n`
    : "";

  // Outcome streak — most recent first. ✓=success ~=partial ✗=error/hang ✕=user_abort.
  const outcomesSection = recentOutcomes && recentOutcomes.length > 0
    ? `\nRecent run outcomes (most recent first): ${streakLine(recentOutcomes)}\n`
    : "";

  const queueList = queue
    .slice(0, 5)
    .map((item, i) => `${i + 1}. ${item}`)
    .join("\n");
  const queueOverflow = queue.length > 5 ? `\n(+${queue.length - 5} more items)` : "";

  return `You are a dispatch strategist for an AI coding agent workflow.
${projectCtx ? `\n${projectCtx}\n` : ""}${commitsSection}${outcomesSection}
The agent just finished a work session. Handoff summary:
  done:   ${handoff.done || "(none)"}
  next:   ${handoff.next || "(none)"}
  health: ${handoff.health || "unknown"}
  tests:  ${handoff.tests || "unknown"}
  todos:  ${handoff.todos || "(none)"}

The queue has ${queue.length} pending task${queue.length === 1 ? "" : "s"}:
${queueList}${queueOverflow}

Decide one of three actions:

1. ACTION: QUEUE — fire queue item 1 verbatim. Prefer when the first queue item is contextually related to what was just done, OR when health is good and there is no strong continuity signal.

2. ACTION: NEXTBEST — fire the canned next_best template (generic "verify health, fix typecheck, execute session next, find adjacent broken thing"). Only choose this when both queue and handoff.next are weak signals AND there's no specific direction emerging from commits/outcomes.

3. ACTION: COMPOSED — you write a fresh prompt body that names exactly what the agent should do right now, drawing on the handoff's "next", the queue tail, the last commit, and the outcome streak. Prefer this when handoff.next is specific (e.g. "fix login flow", "ship migration 0011") or when a queue item plus commit history together point at one clear move. The body should sound like a teammate's next-step note — concrete verbs, named files or features where possible, ≤2000 characters.

Respond in this format (no extra text):

ACTION: <QUEUE | NEXTBEST | COMPOSED>
REASON: one sentence on why this action is right now
PROMPT: <only when ACTION is COMPOSED — the full prompt body the agent will receive. Omit this line otherwise.>`;
}

// ── Groq call ─────────────────────────────────────────────────────────────

async function callGroq(prompt: string): Promise<{ action: DispatchAction; reason: string; prompt?: string }> {
  // maxTokens bumped from 100 → 1500 so the strategist has room for the
  // COMPOSED body (≤2000 chars ≈ ~500 tokens, plus 50 for ACTION + REASON
  // and a safety margin). Temperature stays low so the composer sticks to
  // the named context rather than improvising.
  const text = await callGroqText(prompt, { maxTokens: 1500, temperature: 0.2, timeoutMs: 15_000 });
  return parseGroqResponse(text);
}

function parseGroqResponse(text: string): { action: DispatchAction; reason: string; prompt?: string } {
  const lines = text.split("\n");

  let action: DispatchAction = "queue";
  let reason = "Continuing with queue order.";
  let promptBody: string | undefined;
  // Collecting the PROMPT: body across multiple lines (it can be a paragraph).
  let inPrompt = false;
  const promptLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line && !inPrompt) continue;

    const upper = line.toUpperCase();
    if (upper.startsWith("ACTION:")) {
      const val = upper.replace("ACTION:", "").trim();
      if (val === "NEXTBEST") action = "nextbest";
      else if (val === "COMPOSED") action = "composed";
      else action = "queue";
      inPrompt = false;
      continue;
    }
    if (line.toLowerCase().startsWith("reason:")) {
      reason = line.slice("reason:".length).trim();
      inPrompt = false;
      continue;
    }
    if (line.toLowerCase().startsWith("prompt:")) {
      promptLines.push(line.slice("prompt:".length).trim());
      inPrompt = true;
      continue;
    }
    if (inPrompt) {
      // Continuation of multi-line PROMPT body.
      promptLines.push(rawLine);
    }
  }

  if (promptLines.length > 0) {
    promptBody = promptLines.join("\n").trim();
  }

  // Sanity: if Groq said COMPOSED but didn't actually emit a body, downgrade
  // to NEXTBEST so the caller doesn't dispatch an empty custom prompt.
  if (action === "composed" && (!promptBody || promptBody.length < 10)) {
    action = "nextbest";
    promptBody = undefined;
  }

  return { action, reason, prompt: promptBody };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { handoff, queue, projectName, projectKey, gitBranch, recentCommits } = dataOrResp;

  // Recent outcomes for this project — feeds Groq and is surfaced in the reason.
  // Safe-defaults: if the lookup fails, dispatch still proceeds.
  let recentOutcomes: RecentOutcome[] = [];
  if (projectKey) {
    recentOutcomes = await getRecentOutcomes(userId, projectKey, { limit: 5 }).catch(() => []);
  }
  const streak = streakLine(recentOutcomes);
  const streakSuffix = streak ? `  [last 5: ${streak}]` : "";

  // Per-user auto-inject mode (added 2026-05-20). Gates the strategist
  // behavior before any expensive work:
  //   strategist → current default; queue → composed → next_best fallback
  //   queue_only → only fire when there's a queue item; else off
  //   next_best  → legacy: skip Groq, fire canned template
  //   off        → auto-inject disabled entirely; user dispatches by hand
  const settings = await getBeaconSettings(userId).catch(() => null);
  const mode = settings?.auto_inject_mode ?? "strategist";

  if (mode === "off") {
    return NextResponse.json({
      action: "off",
      reason: "Auto-inject is disabled in your beacon settings.",
      source: "mode_gate",
    } satisfies DispatchResult);
  }

  if (mode === "queue_only") {
    return NextResponse.json({
      action: queue.length > 0 ? "queue" : "off",
      reason: queue.length > 0
        ? `Queue-only mode — firing queue item 1.${streakSuffix}`
        : "Queue-only mode and queue is empty — nothing to do.",
      source: "mode_gate",
    } satisfies DispatchResult);
  }

  if (mode === "next_best") {
    return NextResponse.json({
      action: "nextbest",
      reason: `Legacy next_best mode (no strategist).${streakSuffix}`,
      source: "mode_gate",
    } satisfies DispatchResult);
  }

  // mode === "strategist" — fall through to existing logic.

  // No queue items + strategist mode: still call Groq to compose from
  // handoff + commits + outcomes. The strategist's value is highest
  // exactly when the queue is empty and the user wants a smart nudge.
  // (Previously this short-circuited to nextbest, which was the bug
  // Cursor's audit named.)

  // Hard health gate (duplicate of client-side check — defence in depth).
  const health = handoff.health.toLowerCase();
  const tests  = handoff.tests.toLowerCase();
  if (health.includes("critical") || tests.includes("fail")) {
    return NextResponse.json({
      action: "nextbest",
      reason: `${health.includes("critical") ? "Health critical" : "Tests failing"} — agent must stay focused on recovery before switching concerns.${streakSuffix}`,
      source: "health_gate",
    } satisfies DispatchResult);
  }

  // Groq composition. Even with an empty queue, the strategist composes
  // from session next, recent commits, and outcome streak.
  const prompt = buildPrompt(handoff, queue, projectName, gitBranch, recentCommits, recentOutcomes);

  try {
    const { action, reason, prompt: composedPrompt } = await callGroq(prompt);
    return NextResponse.json({
      action,
      reason: `${reason}${streakSuffix}`,
      source: "groq",
      ...(composedPrompt ? { prompt: composedPrompt } : {}),
    } satisfies DispatchResult);
  } catch (e) {
    // Groq unavailable, key invalid, or timeout — surface the actual cause so
    // the user knows whether to top up credits / rotate the key / wait it out.
    // Without this the UI just said "Groq unavailable" with no hint to action.
    const raw = e instanceof Error ? e.message : String(e);
    const hint = /\b401\b|invalid.api.key/i.test(raw) ? "key invalid"
              : /\b429\b/.test(raw)                  ? "rate-limited"
              : /\b5\d\d\b/.test(raw)                ? "Groq server error"
              : /timeout|abort/i.test(raw)           ? "Groq timed out"
              : raw;
    console.error("[dispatch] groq fallback:", raw);
    return NextResponse.json({
      action: "queue",
      reason: `Groq unavailable (${hint}) — using queue order.${streakSuffix}`,
      source: "fallback",
    } satisfies DispatchResult);
  }
}
