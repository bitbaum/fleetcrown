/**
 * POST /api/control/dispatch
 *
 * Tells the caller (Fleet Runner desktop, or any client that triggers on
 * status:ready) what to fire next when an agent reports done. After the
 * 2026-06-11 mode collapse (killing-the-bash-daemon, Session 3) this is a
 * thin decision layer:
 *
 *   off → action:off (autopilot disabled)
 *   on  → action:queue if queue non-empty, else action:nextbest
 *
 * Safety rails are layered on TOP of the mode (in evaluateDispatchGates):
 * status:working/blocked, pending blockers, no-op fuse, and the explicit
 * health/tests-failing gate here all short-circuit to action:off.
 *
 * The previous Groq composer ("strategist mode") was removed in the same
 * commit. It produced clever but inconsistent prompts on a path most users
 * never opted into; the queue + canned next_best path is what they actually
 * use. The composer can come back as an opt-in /control button if needed,
 * not as part of the auto-fire path.
 */

import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getRecentOutcomes, type RecentOutcome } from "@/db/queries/orchestration-runs";
import { getBeaconSettings } from "@/db/queries/beacon-settings";
import { getProjectAutopilotOverride } from "@/db/queries/projects";
import { DEFAULT_AUTO_INJECT_MODE } from "@/lib/constants/control";
import { evaluateDispatchGates } from "@/lib/orchestration/dispatch-gates";
import type { AutoInjectMode } from "@/config/beacon";
import { promptFingerprint, recordControlAuditEvent } from "@/db/queries/control-audit-events";

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
  /** Agent's self-reported lifecycle. "working"/"blocked" → autopilot must
   *  NOT inject. "ready" → autopilot may fire. Empty is legacy/unknown
   *  (treated permissively as ready). */
  status: z.string().default(""),
});

const DispatchBody = z.object({
  handoff:       HandoffSchema,
  queue:         z.array(z.string().trim().min(1)).max(20),
  /** Count of files in ~/.claude/sessions/<P>.blockers/pending/ as reported
   *  by the caller. >0 short-circuits dispatch — human-action gate. */
  blockerCount:  z.number().int().nonnegative().default(0),
  noOpCount:     z.number().int().nonnegative().default(0),
  projectName:   z.string().optional(),
  projectKey:    z.string().optional(),
  /** Optional context kept on the wire for audit/log purposes only — the
   *  decision logic no longer reads these. Removed in the 2026-06-11
   *  simplification: gitBranch, recentCommits, mission. The bash bridge
   *  may still send them; they are silently ignored. */
});

export type DispatchAction = "queue" | "nextbest" | "off";

export type DispatchResult = {
  action: DispatchAction;
  reason: string;
  source: "health_gate" | "empty_queue" | "mode_gate" | "status_gate" | "blocker_gate";
};

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { handoff, queue, blockerCount, noOpCount, projectName, projectKey } = dataOrResp;

  let recentOutcomes: RecentOutcome[] = [];
  if (projectKey) {
    recentOutcomes = await getRecentOutcomes(userId, projectKey, { limit: 5 }).catch(() => []);
  }
  const streak = streakLine(recentOutcomes);
  const streakSuffix = streak ? `  [last 5: ${streak}]` : "";

  // Per-project override wins over user-level setting. Either lookup
  // fail-safes to the default so a transient DB hiccup doesn't kill dispatch.
  const settings = await getBeaconSettings(userId).catch(() => null);
  const userMode = (settings?.auto_inject_mode ?? DEFAULT_AUTO_INJECT_MODE) as AutoInjectMode;
  let mode: AutoInjectMode = userMode;
  if (projectKey) {
    const override = await getProjectAutopilotOverride(userId, projectKey).catch(() => null);
    if (override) mode = override;
  }

  const recordAndReturn = (result: DispatchResult) => {
    const fingerprint = promptFingerprint(undefined);
    recordControlAuditEvent({
      userId,
      projectKey: projectKey ?? projectName ?? null,
      tabName: projectName ?? projectKey ?? null,
      event: "dispatch_decision",
      source: "api/control/dispatch",
      action: result.action,
      decisionSource: result.source,
      reason: result.reason,
      status: handoff.status || null,
      health: handoff.health || null,
      blockerCount,
      noOpCount,
      queueLength: queue.length,
      mode,
      promptHash: fingerprint.promptHash,
      promptPreview: fingerprint.promptPreview,
      meta: {
        tests: handoff.tests,
        todos: handoff.todos,
        streak,
      },
    });
    return NextResponse.json(result satisfies DispatchResult);
  };

  // Hard health gate — defence in depth. If health is critical or tests are
  // failing, force the agent into recovery (next_best canned template) so
  // it stays focused on fixing what's broken instead of switching concerns.
  const health = handoff.health.toLowerCase();
  const tests  = handoff.tests.toLowerCase();
  if (health.includes("critical") || tests.includes("fail")) {
    return recordAndReturn({
      action: "nextbest",
      reason: `${health.includes("critical") ? "Health critical" : "Tests failing"} — agent must stay focused on recovery before switching concerns.${streakSuffix}`,
      source: "health_gate",
    });
  }

  // Mode + safety gates produce the actual decision. Always returns a
  // DispatchResult now that strategist composition is gone.
  const decision = evaluateDispatchGates({
    status: handoff.status,
    blockerCount,
    mode,
    queueLength: queue.length,
    streakSuffix,
    noOpCount,
  });
  // evaluateDispatchGates never returns null after the collapse — it owns
  // the off/on decision completely. The non-null assertion is safe.
  return recordAndReturn(decision!);
}
