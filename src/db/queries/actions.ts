import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { actions } from "@/db/schema";
import { eq, and, desc, ne, sql } from "drizzle-orm";
import { ACTION_STATUS } from "@/lib/constants/statuses";

export async function getPendingActions() {
  return db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.userId, DEFAULT_USER_ID),
        eq(actions.status, ACTION_STATUS.DRAFT),
      ),
    )
    .orderBy(desc(actions.createdAt));
}

export async function getRecentActions(limit = 20) {
  return db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.userId, DEFAULT_USER_ID),
        ne(actions.status, ACTION_STATUS.DRAFT),
      ),
    )
    .orderBy(desc(actions.reviewedAt))
    .limit(limit);
}

export async function approveAction(id: string) {
  return db
    .update(actions)
    .set({
      status: ACTION_STATUS.APPROVED,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(actions.id, id),
        eq(actions.userId, DEFAULT_USER_ID),
        eq(actions.status, ACTION_STATUS.DRAFT),
      ),
    )
    .returning();
}

export async function rejectAction(id: string) {
  return db
    .update(actions)
    .set({
      status: ACTION_STATUS.REJECTED,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(actions.id, id),
        eq(actions.userId, DEFAULT_USER_ID),
        eq(actions.status, ACTION_STATUS.DRAFT),
      ),
    )
    .returning();
}

export async function getActionStats() {
  const [result] = await db
    .select({
      drafts: sql<number>`count(*) filter (where ${actions.status} = 'draft')`,
      approved: sql<number>`count(*) filter (where ${actions.status} = 'approved')`,
      executed: sql<number>`count(*) filter (where ${actions.status} = 'executed')`,
      rejected: sql<number>`count(*) filter (where ${actions.status} = 'rejected')`,
    })
    .from(actions)
    .where(eq(actions.userId, DEFAULT_USER_ID));

  return {
    drafts: Number(result.drafts),
    approved: Number(result.approved),
    executed: Number(result.executed),
    rejected: Number(result.rejected),
  };
}
