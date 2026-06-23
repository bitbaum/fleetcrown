import type { OrchestrationOutcome } from "@/db/schema/orchestration-runs";
import type { SessionState } from "@/lib/control-types";
import { buildOrchestrationSummary } from "./summary";
import { inferOutcome } from "./infer-outcome";
import type { OrchestrationTaskSummary } from "./contract";

/** The subset of an orchestration run this decision needs. */
export type OpenRun = { startedAt: Date | null; finishedAt: Date | null };

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
  const startedMs = run.startedAt?.getTime() ?? 0;
  if (session.mtime <= startedMs) return null; // handoff predates this run

  const summary = buildOrchestrationSummary({
    status: session.status,
    done: session.done,
    next: session.next,
    tests: session.tests,
    todos: session.todos,
    health: session.health,
    "block-reason": session.blockReason,
    "no-op-count": session.noOpCount != null ? String(session.noOpCount) : undefined,
  });

  const outcome = inferOutcome({ summary });
  return {
    state: outcome === "error" || outcome === "hang" || outcome === "timeout" ? "error" : "done",
    outcome,
    summary,
    finishedAt: new Date(),
  };
}
