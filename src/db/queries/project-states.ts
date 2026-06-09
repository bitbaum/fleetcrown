import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
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

type PromptQueueResult = {
  queue: string[];
  revision: number;
  exists: boolean;
};

type PromptQueueWriteResult = PromptQueueResult & { applied: boolean };

/**
 * Replaces a prompt queue only if the caller still holds the latest revision.
 * Browser tabs and the hook bridge may write concurrently; callers must handle
 * a rejected write by displaying the returned authoritative state.
 */
export async function replaceProjectPromptQueue(
  userId: string,
  projectKey: string,
  tabName: string,
  queue: string[],
  expectedRevision: number,
): Promise<PromptQueueWriteResult> {
  const normalizedKey = projectKey.toLowerCase();

  if (expectedRevision === 0) {
    const [inserted] = await db
      .insert(projectStates)
      .values({
        userId,
        projectKey: normalizedKey,
        tabName,
        promptQueue: queue,
        promptQueueRevision: 1,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      return { queue: inserted.promptQueue, revision: inserted.promptQueueRevision, exists: true, applied: true };
    }
  }

  const [updated] = await db
    .update(projectStates)
    .set({
      tabName,
      promptQueue: queue,
      promptQueueRevision: sql`${projectStates.promptQueueRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(projectStates.userId, userId),
      sql`lower(${projectStates.projectKey}) = ${normalizedKey}`,
      eq(projectStates.promptQueueRevision, expectedRevision),
    ))
    .returning();
  if (updated) {
    return { queue: updated.promptQueue, revision: updated.promptQueueRevision, exists: true, applied: true };
  }

  const current = await getProjectState(userId, normalizedKey);
  return current
    ? { queue: current.promptQueue, revision: current.promptQueueRevision, exists: true, applied: false }
    : { queue: [], revision: 0, exists: false, applied: false };
}

/**
 * Removes one prompt selected by a local runtime mirror. It is deliberately
 * item-based, not snapshot-based, so a stale mirror cannot erase new DB work.
 */
export async function consumeProjectPrompt(
  userId: string,
  projectKey: string,
  consumedPrompt: string,
): Promise<PromptQueueWriteResult & { consumed: boolean }> {
  if (!consumedPrompt) return { queue: [], revision: 0, exists: false, applied: false, consumed: false };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await getProjectState(userId, projectKey);
    if (!row) return { queue: [], revision: 0, exists: false, applied: false, consumed: false };
    const index = row.promptQueue.indexOf(consumedPrompt);
    if (index < 0) {
      return { queue: row.promptQueue, revision: row.promptQueueRevision, exists: true, applied: false, consumed: false };
    }
    const queue = row.promptQueue.filter((_, itemIndex) => itemIndex !== index);
    const result = await replaceProjectPromptQueue(userId, projectKey, row.tabName, queue, row.promptQueueRevision);
    if (result.applied) return { ...result, consumed: true };
  }

  const row = await getProjectState(userId, projectKey);
  return row
    ? { queue: row.promptQueue, revision: row.promptQueueRevision, exists: true, applied: false, consumed: false }
    : { queue: [], revision: 0, exists: false, applied: false, consumed: false };
}

/** Restores a queue item when dispatch failed after an atomic dequeue. */
export async function prependProjectPrompt(
  userId: string,
  projectKey: string,
  tabName: string,
  prompt: string,
): Promise<PromptQueueWriteResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await getProjectState(userId, projectKey);
    const result = await replaceProjectPromptQueue(
      userId,
      projectKey,
      row?.tabName ?? tabName,
      [prompt, ...(row?.promptQueue ?? [])],
      row?.promptQueueRevision ?? 0,
    );
    if (result.applied) return result;
  }

  const row = await getProjectState(userId, projectKey);
  return row
    ? { queue: row.promptQueue, revision: row.promptQueueRevision, exists: true, applied: false }
    : { queue: [], revision: 0, exists: false, applied: false };
}

type SessionFields = Pick<
  NewProjectState,
  "sessionStatus" | "sessionDone" | "sessionNext" | "sessionTests" | "sessionTodos" | "sessionHealth" |
    "sessionBlockReason" | "sessionNoOpCount"
>;

type RuntimeFields = Pick<
  NewProjectState,
  "agentRunning" | "tabOpen" | "activeAgents" | "currentPromptKey" | "currentPromptLabel" |
    "currentPromptStartedAt" | "readyAt" | "lockAt" | "closingAt" | "closedAt"
>;

/** Accepts runtime presence/lifecycle data only from the newest daemon observation. */
export async function persistProjectRuntimeIfNewer(
  patch: Pick<NewProjectState, "userId" | "projectKey" | "tabName"> &
    Partial<Pick<NewProjectState, "projectId"> & RuntimeFields> & { runtimeObservedAt: Date },
) {
  const projectKey = patch.projectKey.toLowerCase();
  const values = { ...patch, projectKey, updatedAt: new Date() };
  const [inserted] = await db.insert(projectStates).values(values).onConflictDoNothing().returning();
  if (inserted) return inserted;

  const updateSet: Partial<NewProjectState> & { updatedAt: Date; runtimeObservedAt: Date } = {
    updatedAt: new Date(),
    runtimeObservedAt: patch.runtimeObservedAt,
  };
  for (const key of [
    "projectId", "tabName", "agentRunning", "tabOpen", "activeAgents", "currentPromptKey",
    "currentPromptLabel", "currentPromptStartedAt", "readyAt", "lockAt", "closingAt", "closedAt",
  ] as const) {
    const value = patch[key];
    if (value !== undefined) (updateSet as Record<string, unknown>)[key] = value;
  }
  const [updated] = await db
    .update(projectStates)
    .set(updateSet)
    .where(and(
      eq(projectStates.userId, patch.userId),
      sql`lower(${projectStates.projectKey}) = ${projectKey}`,
      or(isNull(projectStates.runtimeObservedAt), lt(projectStates.runtimeObservedAt, patch.runtimeObservedAt)),
    ))
    .returning();
  return updated ?? null;
}

/**
 * Accepts session content only when it is newer than the row already stored.
 * Runtime heartbeats and Control reads can arrive out of order.
 */
export async function persistProjectSessionIfNewer(
  patch: Pick<NewProjectState, "userId" | "projectKey" | "tabName"> &
    Partial<Pick<NewProjectState, "projectId"> & SessionFields> & { sessionUpdatedAt: Date },
) {
  const projectKey = patch.projectKey.toLowerCase();
  const values = { ...patch, projectKey, updatedAt: new Date() };
  const [inserted] = await db
    .insert(projectStates)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const updateSet: Partial<NewProjectState> & { updatedAt: Date; sessionUpdatedAt: Date } = {
    updatedAt: new Date(),
    sessionUpdatedAt: patch.sessionUpdatedAt,
  };
  for (const key of [
    "projectId", "tabName", "sessionStatus", "sessionDone", "sessionNext",
    "sessionTests", "sessionTodos", "sessionHealth",
    "sessionBlockReason", "sessionNoOpCount",
  ] as const) {
    const value = patch[key];
    if (value !== undefined) (updateSet as Record<string, unknown>)[key] = value;
  }

  const [updated] = await db
    .update(projectStates)
    .set(updateSet)
    .where(and(
      eq(projectStates.userId, patch.userId),
      sql`lower(${projectStates.projectKey}) = ${projectKey}`,
      or(isNull(projectStates.sessionUpdatedAt), lt(projectStates.sessionUpdatedAt, patch.sessionUpdatedAt)),
    ))
    .returning();
  return updated ?? null;
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

export async function setAllProjectAutoContinue(userId: string, enabled: boolean) {
  return db
    .update(projectStates)
    .set({ autoContinueEnabled: enabled, updatedAt: new Date() })
    .where(eq(projectStates.userId, userId))
    .returning({ projectKey: projectStates.projectKey, tabName: projectStates.tabName });
}

/** Batch version — avoids N separate queries when fetching states for own user + org team owners. */
export async function getProjectStatesByUserIds(userIds: string[]): Promise<(typeof projectStates.$inferSelect)[]> {
  if (userIds.length === 0) return [];
  if (userIds.length === 1) return getProjectStatesByUserId(userIds[0]);
  return db.select().from(projectStates).where(inArray(projectStates.userId, userIds));
}
