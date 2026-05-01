import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orchestrationRuns, type NewOrchestrationRun } from "@/db/schema/orchestration-runs";
import { DEFAULT_USER_ID } from "@/lib/constants";

export async function createOrchestrationRun(run: NewOrchestrationRun) {
  const [created] = await db.insert(orchestrationRuns).values(run).returning();
  return created;
}

export async function updateOrchestrationRun(
  id: string,
  patch: Partial<NewOrchestrationRun>,
) {
  const [updated] = await db
    .update(orchestrationRuns)
    .set(patch)
    .where(
      and(
        eq(orchestrationRuns.id, id),
        eq(orchestrationRuns.userId, DEFAULT_USER_ID),
      ),
    )
    .returning();

  return updated;
}

export async function getLatestRunsByProjectPaths(projectPaths: string[]) {
  if (projectPaths.length === 0) return new Map<string, typeof orchestrationRuns.$inferSelect>();

  const rows = await db
    .select()
    .from(orchestrationRuns)
    .where(
      and(
        eq(orchestrationRuns.userId, DEFAULT_USER_ID),
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
