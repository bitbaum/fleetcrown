import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orchestrationRuns,
  type NewOrchestrationRun,
  type OrchestrationOutcome,
} from "@/db/schema/orchestration-runs";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";

const STALE_RUN_MINUTES = 60;

export async function createOrchestrationRun(run: NewOrchestrationRun) {
  const [created] = await db.insert(orchestrationRuns).values(run).returning();
  return created;
}

// userId is optional: API callers should pass it for isolation;
// background worker callers can omit it since runId is already unique.
export async function updateOrchestrationRun(
  id: string,
  patch: Partial<NewOrchestrationRun>,
  userId?: string,
) {
  const condition = userId
    ? and(eq(orchestrationRuns.id, id), eq(orchestrationRuns.userId, userId))
    : eq(orchestrationRuns.id, id);

  const [updated] = await db
    .update(orchestrationRuns)
    .set(patch)
    .where(condition)
    .returning();

  return updated;
}

export async function cleanupStaleOrchestrationRuns(userId: string) {
  await db
    .update(orchestrationRuns)
    .set({
      state: "error",
      finishedAt: new Date(),
      payload: sql`jsonb_set(COALESCE(payload, '{}'), '{error}', '"Timed out — run exceeded maximum duration and was cleaned up"')`,
    })
    .where(
      and(
        eq(orchestrationRuns.userId, userId),
        eq(orchestrationRuns.state, "running"),
        lt(orchestrationRuns.startedAt, new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000)),
      ),
    );
}

export async function getLatestRunsByProjectPaths(userId: string, projectPaths: string[]) {
  if (projectPaths.length === 0) return new Map<string, typeof orchestrationRuns.$inferSelect>();

  const rows = await db
    .select()
    .from(orchestrationRuns)
    .where(
      and(
        eq(orchestrationRuns.userId, userId),
        inArray(orchestrationRuns.projectPath, projectPaths),
      ),
    )
    .orderBy(desc(orchestrationRuns.startedAt));

  const latest = new Map<string, typeof orchestrationRuns.$inferSelect>();
  for (const row of rows) {
    if (!latest.has(row.projectPath)) {
      latest.set(row.projectPath, row);
    }
  }
  return latest;
}

export async function getProjectOrchestrationRuns(userId: string, projectId: string, limit = 20) {
  return db
    .select()
    .from(orchestrationRuns)
    .where(and(eq(orchestrationRuns.userId, userId), eq(orchestrationRuns.projectId, projectId)))
    .orderBy(desc(orchestrationRuns.startedAt))
    .limit(limit);
}

export type RecentOutcome = {
  outcome: OrchestrationOutcome;
  intent: OrchestrationTaskIntentId;
  finishedAt: Date;
};

/**
 * Batch variant of getRecentOutcomes — one round-trip for all projects on the
 * control panel instead of N queries. Used by /api/control to populate
 * ProjectState.recentOutcomes.
 */
export async function getRecentOutcomesByProjectKeys(
  userId: string,
  projectKeys: string[],
  perKeyLimit = 5,
): Promise<Map<string, OrchestrationOutcome[]>> {
  const result = new Map<string, OrchestrationOutcome[]>();
  if (projectKeys.length === 0) return result;

  const rows = await db
    .select({
      projectKey: orchestrationRuns.projectKey,
      outcome: orchestrationRuns.outcome,
      finishedAt: orchestrationRuns.finishedAt,
    })
    .from(orchestrationRuns)
    .where(and(
      eq(orchestrationRuns.userId, userId),
      inArray(orchestrationRuns.projectKey, projectKeys),
      isNotNull(orchestrationRuns.outcome),
      isNotNull(orchestrationRuns.finishedAt),
    ))
    .orderBy(desc(orchestrationRuns.finishedAt));

  for (const r of rows) {
    if (!r.outcome) continue;
    const arr = result.get(r.projectKey) ?? [];
    if (arr.length < perKeyLimit) arr.push(r.outcome);
    result.set(r.projectKey, arr);
  }
  return result;
}

/**
 * Returns the most recent finished orchestration runs for a project, newest first.
 * Backed by idx_orchestration_runs_recent_outcomes (partial index, finishedAt IS NOT NULL).
 * Used by the dispatch reasoner and ProjectCard streak chip.
 */
export async function getRecentOutcomes(
  userId: string,
  projectKey: string,
  opts: { intent?: OrchestrationTaskIntentId; limit?: number } = {},
): Promise<RecentOutcome[]> {
  const limit = opts.limit ?? 5;
  const conditions = [
    eq(orchestrationRuns.userId, userId),
    eq(orchestrationRuns.projectKey, projectKey),
    isNotNull(orchestrationRuns.outcome),
    isNotNull(orchestrationRuns.finishedAt),
  ];
  if (opts.intent) conditions.push(eq(orchestrationRuns.intent, opts.intent));

  const rows = await db
    .select({
      outcome: orchestrationRuns.outcome,
      intent: orchestrationRuns.intent,
      finishedAt: orchestrationRuns.finishedAt,
    })
    .from(orchestrationRuns)
    .where(and(...conditions))
    .orderBy(desc(orchestrationRuns.finishedAt))
    .limit(limit);

  return rows
    .filter((r): r is { outcome: OrchestrationOutcome; intent: OrchestrationTaskIntentId; finishedAt: Date } =>
      r.outcome !== null && r.finishedAt !== null)
    .map((r) => ({ outcome: r.outcome, intent: r.intent, finishedAt: r.finishedAt }));
}
