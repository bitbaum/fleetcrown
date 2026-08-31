import { getOrchestrationRunsByIds } from "@/db/queries/orchestration-runs";
import type { FeedbackListItem } from "@/db/queries/site-feedback";
import {
  deriveFeedbackWork,
  type FeedbackWorkView,
  type FeedbackRunSnapshot,
} from "@/lib/feedback/work-phase";
import type { OrchestrationState } from "@/lib/orchestration/contract";

export type FeedbackListItemWithWork = FeedbackListItem & { work: FeedbackWorkView };

/** Attach honest work-phase to inbox rows from linked orchestration runs.
 *  Generic so callers with wider rows (e.g. the cross-project inbox, which
 *  carries projectName) keep their extra fields in the result type. */
export async function attachFeedbackWork<T extends FeedbackListItem>(
  userId: string,
  items: T[],
): Promise<(T & { work: FeedbackWorkView })[]> {
  const runIds = [
    ...new Set(items.map((i) => i.dispatchedRunId).filter((id): id is string => !!id)),
  ];
  const runs = await getOrchestrationRunsByIds(userId, runIds);

  return items.map((item) => {
    const row = item.dispatchedRunId ? runs.get(item.dispatchedRunId) : undefined;
    return { ...item, work: deriveFeedbackWork(item.status, runToFeedbackSnapshot(row)) };
  });
}

/** Run row → the snapshot shape deriveFeedbackWork consumes. Shared with the
 *  dispatch route's duplicate-guard so "is the agent working" has ONE source
 *  of truth (the route used to re-implement the thresholds inline). */
export function runToFeedbackSnapshot(
  row:
    | {
        id: string;
        state: string;
        outcome: string | null;
        startedAt: Date;
        finishedAt: Date | null;
        payload: unknown;
      }
    | null
    | undefined,
): FeedbackRunSnapshot | null {
  if (!row) return null;
  return {
    id: row.id,
    state: row.state as OrchestrationState,
    outcome: row.outcome ?? null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    deliveredAt: (row.payload as { deliveredAt?: string } | null)?.deliveredAt ?? null,
    error: (row.payload as { error?: string } | null)?.error ?? null,
  };
}
