import { db } from "@/db";
import { actions } from "@/db/schema";
import { eq, and, desc, ne, sql } from "drizzle-orm";
import { ACTION_STATUS } from "@/lib/constants/statuses";

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
