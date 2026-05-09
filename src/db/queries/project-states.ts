import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projectStates, type NewProjectState } from "@/db/schema/project-states";

export async function upsertProjectState(patch: NewProjectState) {
  // Only include non-undefined fields in the conflict-update clause.
  // This way a PATCH with {readyAt} doesn't wipe closedAt back to null.
  const updateSet: Partial<NewProjectState> & { updatedAt: Date } = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && k !== "projectKey") {
      (updateSet as Record<string, unknown>)[k] = v;
    }
  }

  const [row] = await db
    .insert(projectStates)
    .values({ ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: projectStates.projectKey,
      set: updateSet,
    })
    .returning();
  return row;
}

export async function getProjectState(projectKey: string) {
  const [row] = await db
    .select()
    .from(projectStates)
    .where(eq(projectStates.projectKey, projectKey))
    .limit(1);
  return row ?? null;
}

export async function getProjectStatesByUserId(userId: string): Promise<(typeof projectStates.$inferSelect)[]> {
  return db.select().from(projectStates).where(eq(projectStates.userId, userId));
}
