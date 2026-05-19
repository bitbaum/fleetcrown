import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projectStates, type NewProjectState } from "@/db/schema/project-states";

/**
 * Upserts the runtime-state row identified by (userId, projectKey).
 *
 * `patch.userId` and `patch.projectKey` are required by the schema. The conflict
 * target is the composite primary key, so cross-tenant overwrites are impossible:
 * two users with a project named "cockpit" each get their own row.
 */
export async function upsertProjectState(patch: NewProjectState) {
  // Only include non-undefined fields in the conflict-update clause.
  // This way a PATCH with {readyAt} doesn't wipe closedAt back to null.
  const updateSet: Partial<NewProjectState> & { updatedAt: Date } = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && k !== "projectKey" && k !== "userId") {
      (updateSet as Record<string, unknown>)[k] = v;
    }
  }

  const [row] = await db
    .insert(projectStates)
    .values({ ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [projectStates.userId, projectStates.projectKey],
      set: updateSet,
    })
    .returning();
  return row;
}

export async function getProjectState(userId: string, projectKey: string) {
  const [row] = await db
    .select()
    .from(projectStates)
    .where(and(eq(projectStates.userId, userId), eq(projectStates.projectKey, projectKey)))
    .limit(1);
  return row ?? null;
}

/**
 * Looks up runtime state for a project entity owned by a specific user.
 * Callers must pass the OWNER's userId — for org-shared (team) projects, that's
 * the resolved ownerId from resolveProjectDetailWithOrgFallback, not the viewer.
 */
export async function getProjectStateByProjectId(userId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(projectStates)
    .where(and(eq(projectStates.userId, userId), eq(projectStates.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function getProjectStatesByUserId(userId: string): Promise<(typeof projectStates.$inferSelect)[]> {
  return db.select().from(projectStates).where(eq(projectStates.userId, userId));
}

/** Batch version — avoids N separate queries when fetching states for own user + org team owners. */
export async function getProjectStatesByUserIds(userIds: string[]): Promise<(typeof projectStates.$inferSelect)[]> {
  if (userIds.length === 0) return [];
  if (userIds.length === 1) return getProjectStatesByUserId(userIds[0]);
  return db.select().from(projectStates).where(inArray(projectStates.userId, userIds));
}
