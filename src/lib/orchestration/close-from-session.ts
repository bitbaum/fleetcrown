import type { OrchestrationOutcome } from "@/db/schema/orchestration-runs";
import type { SessionState } from "@/lib/control-types";
import { isFailingOutcome } from "@/lib/events";
import { buildOrchestrationSummary } from "./summary";
import { inferOutcome } from "./infer-outcome";
import type { OrchestrationTaskSummary } from "./contract";

/** The subset of an orchestration run this decision needs. */
export type OpenRun = {
  startedAt: Date | null;
  finishedAt: Date | null;
  /** Run payload — carries deliveredAt (runner-ack time of the prompt) when present. */
  payload?: { deliveredAt?: string } | null;
};

/**
 * True when this run's prompt is known to have reached an agent. `deliveredAt`
 * is stamped on exactly one event — the prompt landing in a session — by the
 * runner ack for queued dispatches and at inject time for direct ones. So it
 * has no third state: absent means NOT DELIVERED, never "unknown".
 *
 * That distinction is the whole fix. This used to fall back to `startedAt`
 * when the stamp was missing, which reads an undelivered run as if it had been
 * delivered at dispatch time — and any later handoff then post-dates it.
 */
export function runWasDelivered(run: OpenRun): boolean {
  const delivered = run.payload?.deliveredAt;
  return typeof delivered === "string" && Number.isFinite(Date.parse(delivered));
}

/**
 * The freshness floor a closing handoff must post-date. `deliveredAt` (stamped
 * when the prompt reached the agent) beats `startedAt` (dispatch-creation
 * time): a run can sit queued behind an older run for many minutes, and a
 * stale ready re-push from before its prompt was even delivered must never
 * close it — that is how run B used to get closed (and its feedback
 * auto-resolved) off run A's handoff.
 *
 * Only ever called for a delivered run (closeRunFromSession rejects the rest),
 * so the startedAt fallback is unreachable defence, not the undelivered path.
 */
export function runEffectiveStartMs(run: OpenRun): number {
  const delivered = run.payload?.deliveredAt;
  if (typeof delivered === "string") {
    const ms = Date.parse(delivered);
    if (Number.isFinite(ms)) return ms;
  }
  return run.startedAt?.getTime() ?? 0;
}

export type RunClosePatch = {
  state: "done" | "error";
  outcome: OrchestrationOutcome;
  summary: OrchestrationTaskSummary;
  finishedAt: Date;
};

/**
 * Decide whether an agent's session handoff closes an open orchestration run.
 *
 * Why this exists: when `home/worker.ts` + the bash stop-hook were retired in the
 * "killing-the-bash-daemon" migration, nothing closed runs on the local-runtime
 * path. Runs stayed open forever and Activity showed "0 finished" even after the
 * agent had finished. The control poll already reads the agent's session.md
 * handoff every cycle (`parseSession`); this turns that existing read into the
 * run-close signal instead of resurrecting a daemon.
 *
 * Closes only when the agent self-reports `status: 'ready'` — its explicit "done"
 * marker ('working'/'blocked'/missing never close) — AND the handoff post-dates
 * the run start, so a stale handoff from a previous task cannot close a fresh run.
 * Outcome (success / partial / error) and the commit SHA come from `inferOutcome`
 * over the handoff: the same machinery `/api/orchestration/runs/[id]/finish` uses.
 *
 * Returns the close patch, or null when the run should stay open (idempotent: a
 * run that already has `finishedAt` is never re-closed).
 */
export function closeRunFromSession(run: OpenRun, session: SessionState): RunClosePatch | null {
  if (run.finishedAt) return null; // already closed
  if (session.status?.toLowerCase() !== "ready") return null; // agent not done
  // A run whose prompt never reached an agent cannot have produced this
  // handoff — somebody else's work did. Closing it here would not merely
  // mislabel the run: `success` funnels into resolveFeedbackForRun, so the
  // visitor whose report was never touched is told it shipped. Undelivered
  // runs belong to the reaper, which stamps the honest `timeout`.
  if (!runWasDelivered(run)) return null;
  const startedMs = runEffectiveStartMs(run);
  if (session.mtime <= startedMs) return null; // handoff predates this run (or its delivery)

  const summary = buildOrchestrationSummary({
    status: session.status,
    done: session.done,
    next: session.next,
    tests: session.tests,
    todos: session.todos,
    health: session.health,
    // The evidence fields the DoD judge is prompted to check. Omitting them
    // here was silent: `buildOrchestrationSummary` defaults every unlisted
    // field to "", `summaryForJudge` then filters empty fields out, and the
    // judge saw a handoff with no typecheck/lint/commit line at all — so it
    // graded "no evidence" and downgraded the run, exactly as instructed.
    tsc: session.tsc,
    lint: session.lint,
    commit: session.commit,
    "block-reason": session.blockReason,
    "no-op-count": session.noOpCount != null ? String(session.noOpCount) : undefined,
  });

  const outcome = inferOutcome({ summary });
  return {
    state: isFailingOutcome(outcome) ? "error" : "done",
    outcome,
    summary,
    finishedAt: new Date(),
  };
}
