/**
 * Unattended run-close sweep — close open runs from runner-PUSHED session state.
 *
 * The only run-closer used to be the /api/control GET: it reads the freshest
 * session handoff and closes the run — but it only executes when a human loads
 * the page. Unattended (autopilot at 04:00, founder asleep), a box agent would
 * finish its task, push its handoff, and the run still sat open until the
 * reaper stamped it. This sweep runs on the clock (reap-stale-runs cron, BEFORE
 * reaping): for every open run, project the persisted project_states row into a
 * SessionState and put it through the exact same seam close + DoD gate the page
 * path uses. Same inputs, same gate, same ledger — just no human required.
 *
 * node-only (the claude seam pulls in fs) — import from route handlers only.
 */
import { listOpenRuns } from "@/db/queries/orchestration-runs";
import { getProjectState } from "@/db/queries/project-states";
import { getRecentOutcomes } from "@/db/queries/orchestration-runs";
import { resolveProjectSession } from "@/lib/project-session";
import { adapterFor } from "@/lib/orchestration/adapter-registry";
import { ORCHESTRATION_ADAPTER_IDS, DEFAULT_ADAPTER_ID, type AdapterId } from "@/lib/orchestration/contract";
import { gateAndCloseRun, closingRuns } from "@/lib/orchestration/gate-and-close";

export type CloseSweepResult = {
  checked: number;
  closed: Array<{ runId: string; projectKey: string; outcome: string }>;
};

type OpenRunRow = Awaited<ReturnType<typeof listOpenRuns>>[number];

/** Try to close ONE open run from its project's pushed session state. Returns
 *  the closed outcome, or null when the run stays open. */
async function tryCloseRun(run: OpenRunRow): Promise<string | null> {
  if (closingRuns.has(run.id)) return null; // another close is in flight
  const state = await getProjectState(run.userId, run.projectKey).catch(() => null);
  const session = resolveProjectSession(null, state);
  if (!session) return null;

  const adapterId: AdapterId = (ORCHESTRATION_ADAPTER_IDS as readonly string[]).includes(run.adapter)
    ? (run.adapter as AdapterId)
    : DEFAULT_ADAPTER_ID;
  const patch = adapterFor(adapterId)?.closeRunFromSession?.(run, session) ?? null;
  if (!patch) return null; // handoff not ready / predates the run — leave open

  closingRuns.add(run.id);
  try {
    const recent = await getRecentOutcomes(run.userId, run.projectKey).catch(() => []);
    await gateAndCloseRun(run.id, patch, run.userId, run.projectKey, recent.map((r) => r.outcome), run.adapter);
    return patch.outcome;
  } finally {
    closingRuns.delete(run.id);
  }
}

/** Close every open run whose project's pushed session state reports a ready
 *  handoff newer than the run start. Serial on purpose — each close may invoke
 *  the cross-model DoD judge, and a cron tick has headroom while a thundering
 *  herd of judge calls does not. */
export async function closeOpenRunsFromPushedState(): Promise<CloseSweepResult> {
  const open = await listOpenRuns();
  const closed: CloseSweepResult["closed"] = [];

  for (const run of open) {
    const outcome = await tryCloseRun(run).catch(() => null);
    if (outcome) closed.push({ runId: run.id, projectKey: run.projectKey, outcome });
  }

  return { checked: open.length, closed };
}

/**
 * Immediate variant for the runtime-state ingestion path: the moment a runner
 * pushes a `ready` handoff for a project, close that project's open run —
 * no waiting for the hourly cron tick. minAge 0: the handoff's own
 * "post-dates run start" guard (closeRunFromSession) is the race protection.
 */
export async function closeOpenRunsForProject(userId: string, projectKey: string): Promise<number> {
  const open = await listOpenRuns(0);
  let n = 0;
  for (const run of open) {
    if (run.userId !== userId || run.projectKey.toLowerCase() !== projectKey.toLowerCase()) continue;
    const outcome = await tryCloseRun(run).catch(() => null);
    if (outcome) n++;
  }
  return n;
}
