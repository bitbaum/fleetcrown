import { getOrchestrationRunsByIds } from "@/db/queries/orchestration-runs";
import type { FeedbackListItem } from "@/db/queries/site-feedback";
import {
  deriveFeedbackWork,
  type FeedbackWorkView,
  type FeedbackRunSnapshot,
} from "@/lib/feedback/work-phase";
import type { OrchestrationState } from "@/lib/orchestration/contract";

export type FeedbackListItemWithWork = FeedbackListItem & { work: FeedbackWorkView };

/** Attach honest work-phase to inbox rows from linked orchestration runs. */
export async function attachFeedbackWork(
  userId: string,
  items: FeedbackListItem[],
): Promise<FeedbackListItemWithWork[]> {
  const runIds = [...new Set(items.map((i) => i.dispatchedRunId).filter((id): id is string => !!id))];
  const runs = await getOrchestrationRunsByIds(userId, runIds);

  return items.map((item) => {
    const row = item.dispatchedRunId ? runs.get(item.dispatchedRunId) : undefined;
    const snap: FeedbackRunSnapshot | null = row
      ? {
          id: row.id,
          state: row.state as OrchestrationState,
          outcome: row.outcome ?? null,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          deliveredAt: (row.payload as { deliveredAt?: string } | null)?.deliveredAt ?? null,
          error: (row.payload as { error?: string } | null)?.error ?? null,
        }
      : null;
    return { ...item, work: deriveFeedbackWork(item.status, snap) };
  });
}
