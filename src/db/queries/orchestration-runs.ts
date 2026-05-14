import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { orchestrationRuns, type NewOrchestrationRun } from "@/db/schema/orchestration-runs";

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
