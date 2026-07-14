/**
 * Shared run-close with the definition-of-done stop-gate.
 *
 * Extracted from /api/control (which closes runs when a page poll sees a fresh
 * session handoff) so the reap-stale-runs cron can close runs UNATTENDED from
 * runner-pushed session state. Before this, run-close only ever happened on a
 * human page load — box-executed autopilot runs finished their work at 04:00,
 * nobody looked, and the reaper stamped them `timeout` an hour later (the
 * 2026-07-14 diagnosis: 14 days of autopilot, zero recorded successes, all of
 * them real work reaped as failures).
 */
import { getProjectGoalConfig } from "@/db/queries/project-context";
import { updateOrchestrationRun } from "@/db/queries/orchestration-runs";
import { emitRunEvent } from "@/db/queries/run-events";
import { verifyDefinitionOfDone, applyDoDGate, DOD_JUDGE_MODEL } from "@/lib/orchestration/dod-gate";
import type { RunClosePatch } from "@/lib/orchestration/close-from-session";
import type { OrchestrationOutcome } from "@/db/schema/orchestration-runs";
import { ORCHESTRATION_OUTCOME } from "@/db/schema/orchestration-runs";

/** Runs whose close is being gated/persisted right now — prevents the DoD judge
 *  from firing more than once per run while a fire-and-forget close is in flight.
 *  Module-level so the control route and the cron sweep share one in-flight set. */
export const closingRuns = new Set<string>();

/**
 * Close an orchestration run, applying the definition-of-done stop-gate first.
 * When the run would close SUCCESS and the project declares a definition_of_done,
 * a different-lineage model checks the handoff against that bar; if it isn't met,
 * the run closes "partial" with the gap as `next`, so autopilot's continue-loop
 * keeps working instead of stopping on the agent's own say-so (the /goal pattern).
 */
export async function gateAndCloseRun(
  runId: string,
  closePatch: RunClosePatch,
  userId: string,
  projectKey: string,
  recentOutcomes: OrchestrationOutcome[] = [],
  workerAdapter = "agent",
): Promise<void> {
  let patch = closePatch;
  if (closePatch.outcome === ORCHESTRATION_OUTCOME.SUCCESS) {
    const { definitionOfDone: dod, maxTurns } = await getProjectGoalConfig(userId, projectKey).catch(() => ({ definitionOfDone: null, maxTurns: null }));
    if (dod) {
      const verdict = await verifyDefinitionOfDone(dod, closePatch.summary);
      // priorPartials = consecutive partial closes so far = how many times the
      // goal has already re-looped (recentOutcomes is most-recent-first).
      let priorPartials = 0;
      for (const o of recentOutcomes) { if (o === ORCHESTRATION_OUTCOME.PARTIAL) priorPartials++; else break; }
      patch = applyDoDGate(closePatch, verdict, { maxTurns, priorPartials });
      // Record the cross-model verdict on the run so Activity can show that a
      // DIFFERENT model lineage judged the worker's handoff — the moat made
      // visible ("worker did it, judge checked it, here's the verdict").
      patch = {
        ...patch,
        summary: {
          ...patch.summary,
          verification: { judge: DOD_JUDGE_MODEL, worker: workerAdapter, met: verdict.met, gap: verdict.gap || undefined },
        },
      };
    }
  }
  await updateOrchestrationRun(runId, patch, userId);
  // Run ledger: the closing hop declares itself with its (possibly DoD-gated)
  // outcome — the run's biography ends with a verdict, not silence.
  void emitRunEvent(runId, userId, "closed", { outcome: patch.outcome, state: patch.state });
}
