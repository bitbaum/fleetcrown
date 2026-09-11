import { getOrchestrationRunsByIds } from "@/db/queries/orchestration-runs";
import { getUserProjectsByEntityIds } from "@/db/queries/user-projects";
import type { FeedbackListItem } from "@/db/queries/site-feedback";
import {
  deriveFeedbackWork,
  type FeedbackWorkView,
  type FeedbackRunSnapshot,
} from "@/lib/feedback/work-phase";
import {
  fixNeedsRefresh,
  refreshFixShipping,
  FIX_REFRESH_MAX_PER_REQUEST,
} from "@/lib/feedback/fix-shipping-refresh";
import { FIX_SHIP_STATE, parsePrRef, type FixShipping } from "@/lib/feedback/fix-shipping";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import {
  ORCH_STATE,
  ORCHESTRATION_OUTCOME,
  type OrchestrationState,
} from "@/lib/orchestration/contract";

export type FeedbackListItemWithWork = FeedbackListItem & { work: FeedbackWorkView };

type RunRow = {
  id: string;
  state: string;
  outcome: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  payload: unknown;
  summary: unknown;
};

/** Attach honest work-phase to inbox rows from linked orchestration runs.
 *  Generic so callers with wider rows (e.g. the cross-project inbox, which
 *  carries projectName) keep their extra fields in the result type.
 *
 *  Rows whose run finished well also get the fix ledger refreshed — where the
 *  PR is on its way to the live product — bounded per request. */
export async function attachFeedbackWork<T extends FeedbackListItem>(
  userId: string,
  items: T[],
): Promise<(T & { work: FeedbackWorkView })[]> {
  const runIds = [
    ...new Set(items.map((i) => i.dispatchedRunId).filter((id): id is string => !!id)),
  ];
  const runs = await getOrchestrationRunsByIds(userId, runIds);

  // Projects first: deciding whether a cached ledger is still ABOUT the right
  // pull request means re-parsing the handoff, and that needs the repo.
  const dispatched = items.filter(
    (i) => i.status === FEEDBACK_STATUS.DISPATCHED && !!i.dispatchedRunId,
  );
  const projects = dispatched.length
    ? await getUserProjectsByEntityIds(userId, [...new Set(dispatched.map((i) => i.projectId))])
    : new Map<
        string,
        Awaited<ReturnType<typeof getUserProjectsByEntityIds>> extends Map<string, infer V>
          ? V
          : never
      >();

  // The fix ledger: only for dispatched rows whose run closed well, only when
  // the cached answer can still change, and only a handful per request.
  const candidates = items.filter((item) => {
    if (item.status !== FEEDBACK_STATUS.DISPATCHED || !item.dispatchedRunId) return false;
    const run = runs.get(item.dispatchedRunId);
    if (!run || !runFinishedWell(run)) return false;
    // Re-parse the handoff every time (pure, free) so a cached answer about a
    // DIFFERENT pull request is never trusted — that is how a parser bug froze
    // rows in a terminal state nothing could correct.
    const expected = parsePrRef(
      (run.summary as { done?: string } | null)?.done ?? null,
      projects.get(item.projectId)?.gitUrl ?? null,
    );
    return fixNeedsRefresh(runFix(run), { expectedPrUrl: expected?.url ?? null });
  });
  const refreshed = new Map<string, FixShipping>();
  // Projects whose last shipped fix failed to deploy, computed from the
  // ledgers already cached on their runs — no extra state to keep in sync.
  const brokenProjects = new Set<string>();
  for (const item of items) {
    const run = item.dispatchedRunId ? runs.get(item.dispatchedRunId) : undefined;
    if (run && runFix(run)?.state === FIX_SHIP_STATE.DEPLOY_FAILED)
      brokenProjects.add(item.projectId);
  }
  if (candidates.length) {
    await Promise.all(
      candidates.slice(0, FIX_REFRESH_MAX_PER_REQUEST).map(async (item) => {
        const run = runs.get(item.dispatchedRunId!)!;
        const project = projects.get(item.projectId);
        const fix = await refreshFixShipping({
          runId: run.id,
          userId,
          cached: runFix(run),
          summaryDone: (run.summary as { done?: string } | null)?.done ?? null,
          evidence:
            (run.payload as { evidence?: FixShipping["push"] & { kind: string } } | null)
              ?.evidence ?? null,
          gitUrl: project?.gitUrl ?? null,
          // Without these two the merge path below can never run: decideAutoShip
          // reads `autoShip === true` and holds on anything else, so an omitted
          // field silently disables the whole feature. It shipped omitted once
          // (2026-09-11) — the switch saved, the row read "PR #1 · open", and
          // nothing ever decided. The gate test pins the wiring, not just the rule.
          autoShip: project?.autoShip ?? null,
          deployBroken: brokenProjects.has(item.projectId),
        });
        refreshed.set(run.id, fix);
      }),
    );
  }

  return items.map((item) => {
    const row = item.dispatchedRunId ? runs.get(item.dispatchedRunId) : undefined;
    const snap = runToFeedbackSnapshot(row);
    if (snap && row && refreshed.has(row.id)) snap.fix = refreshed.get(row.id) ?? null;
    return { ...item, work: deriveFeedbackWork(item.status, snap) };
  });
}

function runFix(run: RunRow): FixShipping | null {
  return (run.payload as { fix?: FixShipping } | null)?.fix ?? null;
}

function runFinishedWell(run: RunRow): boolean {
  const closed =
    run.state === ORCH_STATE.DONE ||
    run.state === ORCH_STATE.CLOSED ||
    run.state === ORCH_STATE.CLOSING;
  return (
    closed &&
    (run.outcome === ORCHESTRATION_OUTCOME.SUCCESS || run.outcome === ORCHESTRATION_OUTCOME.PARTIAL)
  );
}

/** Run row → the snapshot shape deriveFeedbackWork consumes. Shared with the
 *  dispatch route's duplicate-guard so "is the agent working" has ONE source
 *  of truth (the route used to re-implement the thresholds inline). */
export function runToFeedbackSnapshot(row: RunRow | null | undefined): FeedbackRunSnapshot | null {
  if (!row) return null;
  const payload = row.payload as {
    deliveredAt?: string;
    lastProgressAt?: string;
    error?: string;
    fix?: FixShipping;
  } | null;
  return {
    id: row.id,
    state: row.state as OrchestrationState,
    outcome: row.outcome ?? null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    deliveredAt: payload?.deliveredAt ?? null,
    lastProgressAt: payload?.lastProgressAt ?? null,
    error: payload?.error ?? null,
    summaryDone: (row.summary as { done?: string } | null)?.done ?? null,
    fix: payload?.fix ?? null,
  };
}
