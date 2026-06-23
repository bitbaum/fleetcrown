import { db } from "@/db";
import { actions } from "@/db/schema";
import type { ActionPayload, NewAction } from "@/db/schema/actions";
import { eq, and, desc, ne, sql } from "drizzle-orm";
import { ACTION_STATUS, type ActionType } from "@/lib/constants/statuses";

export type ActionRow = typeof actions.$inferSelect;

/** Input Ivy (or any producer) supplies to enqueue a draft action.
 *  Mirrors the writable subset of NewAction; userId/status/timestamps are set here. */
export type ProposeActionInput = {
  type: ActionType;
  title: string;
  description?: string | null;
  payload?: ActionPayload | null;
  reasoning?: string | null;
  entityId?: string | null;
  expiresAt?: Date | null;
};

/**
 * Producer for the action queue — the ONLY way a draft enters.
 * Inserts with status='draft' (the IRON RULE start state). Dedupes against the
 * partial unique index idx_actions_unique_draft_title (userId, title WHERE status='draft'):
 * a re-proposal of an already-pending title is a no-op and returns null.
 */
export async function proposeAction(userId: string, input: ProposeActionInput): Promise<ActionRow | null> {
  const values: NewAction = {
    userId,
    type: input.type,
    status: ACTION_STATUS.DRAFT,
    title: input.title,
    description: input.description ?? null,
    payload: input.payload ?? null,
    reasoning: input.reasoning ?? null,
    entityId: input.entityId ?? null,
    expiresAt: input.expiresAt ?? null,
  };
  const [created] = await db
    .insert(actions)
    .values(values)
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

/**
 * Mark an approved action as executed. Guarded by status='approved' so it can
 * only advance approved → executed (never resurrect a draft/rejected row, and
 * idempotent: a second call after execution matches nothing and returns null).
 */
export async function markActionExecuted(id: string, userId: string): Promise<ActionRow | null> {
  const [updated] = await db
    .update(actions)
    .set({ status: ACTION_STATUS.EXECUTED, executedAt: new Date() })
    .where(and(eq(actions.id, id), eq(actions.userId, userId), eq(actions.status, ACTION_STATUS.APPROVED)))
    .returning();
  return updated ?? null;
}

export async function getPendingActions(userId: string) {
  return db
    .select()
    .from(actions)
    .where(and(eq(actions.userId, userId), eq(actions.status, ACTION_STATUS.DRAFT)))
    .orderBy(desc(actions.createdAt));
}

export async function getRecentActions(userId: string, limit = 20) {
  return db
    .select()
    .from(actions)
    .where(and(eq(actions.userId, userId), ne(actions.status, ACTION_STATUS.DRAFT)))
    .orderBy(desc(actions.reviewedAt))
    .limit(limit);
}

export async function approveAction(id: string, userId: string) {
  return db
    .update(actions)
    .set({ status: ACTION_STATUS.APPROVED, reviewedAt: new Date() })
    .where(and(eq(actions.id, id), eq(actions.userId, userId), eq(actions.status, ACTION_STATUS.DRAFT)))
    .returning();
}

export async function rejectAction(id: string, userId: string) {
  return db
    .update(actions)
    .set({ status: ACTION_STATUS.REJECTED, reviewedAt: new Date() })
    .where(and(eq(actions.id, id), eq(actions.userId, userId), eq(actions.status, ACTION_STATUS.DRAFT)))
    .returning();
}

export async function getActionStats(userId: string) {
  const [result] = await db
    .select({
      drafts: sql<number>`count(*) filter (where ${actions.status} = ${ACTION_STATUS.DRAFT})`,
      approved: sql<number>`count(*) filter (where ${actions.status} = ${ACTION_STATUS.APPROVED})`,
      executed: sql<number>`count(*) filter (where ${actions.status} = ${ACTION_STATUS.EXECUTED})`,
      rejected: sql<number>`count(*) filter (where ${actions.status} = ${ACTION_STATUS.REJECTED})`,
    })
    .from(actions)
    .where(eq(actions.userId, userId));

  return {
    drafts: Number(result.drafts),
    approved: Number(result.approved),
    executed: Number(result.executed),
    rejected: Number(result.rejected),
  };
}
