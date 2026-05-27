import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectStates, type NewProjectState } from "@/db/schema/project-states";

/**
 * Upserts the runtime-state row identified by (userId, lower(projectKey)).
 *
 * Runtime reports and UI requests may use display-case variants of the same
 * tab name. Read/update using the schema's case-insensitive identity and
 * normalize newly inserted keys to keep a single row per user and project.
 */
export async function upsertProjectState(patch: NewProjectState) {
  const projectKey = patch.projectKey.toLowerCase();
  // Only include non-undefined fields in the conflict-update clause.
  // This way a PATCH with {readyAt} doesn't wipe closedAt back to null.
  const updateSet: Partial<NewProjectState> & { updatedAt: Date } = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && k !== "projectKey" && k !== "userId") {
      (updateSet as Record<string, unknown>)[k] = v;
    }
  }

  const [inserted] = await db
    .insert(projectStates)
    .values({ ...patch, projectKey, updatedAt: new Date() })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const [row] = await db
    .update(projectStates)
    .set(updateSet)
    .where(and(
      eq(projectStates.userId, patch.userId),
      sql`lower(${projectStates.projectKey}) = ${projectKey}`,
    ))
    .returning();
  return row;
}

export async function getProjectState(userId: string, projectKey: string) {
  const normalizedKey = projectKey.toLowerCase();
  const [row] = await db
    .select()
    .from(projectStates)
    .where(and(
      eq(projectStates.userId, userId),
      sql`lower(${projectStates.projectKey}) = ${normalizedKey}`,
    ))
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
