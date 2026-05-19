/**
 * POST /api/control/dispatch
 *
 * Strategist layer: decides whether to drain the queue or run next_best
 * given the current session handoff, pending queue items, git context, and
 * recent commit history. Returns quickly (< 300ms on Groq free tier).
 * Falls back to QUEUE when Groq is unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { callGroqText } from "@/lib/groq";
import { getApiUserId } from "@/lib/session";
import { getRecentOutcomes, type RecentOutcome } from "@/db/queries/orchestration-runs";

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

export type DispatchAction = "queue" | "nextbest";

export type DispatchResult = {
  action: DispatchAction;
  reason: string;
  /** Which inference path produced the decision. */
  source: "groq" | "health_gate" | "empty_queue" | "fallback";
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

Decide: should the agent next run queue item 1, or follow its own suggested next step?

Rules:
- Prefer QUEUE when: the first queue item is contextually related to what was just done or the recent commits, OR health is good and there is no strong continuity signal.
- Prefer NEXTBEST when: the agent's "next" field describes an obvious direct follow-up to "done", OR health is "needs attention" and the queue item is unrelated to recent commit history.
- NEXTBEST is already required (caller enforces it) when health is "critical" or tests contain "fail" — do not factor those in; focus on the subtler cases.

Respond in exactly this format (two lines, nothing else):
ACTION: QUEUE
REASON: one sentence explaining why the queue item should fire next

or

ACTION: NEXTBEST
REASON: one sentence explaining why the agent's continuation is better right now`;
}

// ── Groq call ─────────────────────────────────────────────────────────────

async function callGroq(prompt: string): Promise<{ action: DispatchAction; reason: string }> {
  const text = await callGroqText(prompt, { maxTokens: 100, temperature: 0.2, timeoutMs: 10_000 });
  return parseGroqResponse(text);
}

function parseGroqResponse(text: string): { action: DispatchAction; reason: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let action: DispatchAction = "queue";
  let reason = "Continuing with queue order.";

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("ACTION:")) {
      const val = upper.replace("ACTION:", "").trim();
      action = val === "NEXTBEST" ? "nextbest" : "queue";
    }
    if (line.toLowerCase().startsWith("reason:")) {
      reason = line.slice("reason:".length).trim();
    }
  }

  return { action, reason };
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

  // No queue items — trivially run next_best.
  if (queue.length === 0) {
    return NextResponse.json({
      action: "nextbest",
      reason: `Queue is empty — running AI-driven next step.${streakSuffix}`,
      source: "empty_queue",
    } satisfies DispatchResult);
  }

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

  // Groq classification.
  const prompt = buildPrompt(handoff, queue, projectName, gitBranch, recentCommits, recentOutcomes);

  try {
    const { action, reason } = await callGroq(prompt);
    return NextResponse.json({
      action,
      reason: `${reason}${streakSuffix}`,
      source: "groq",
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
