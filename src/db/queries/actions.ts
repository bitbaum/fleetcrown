import { db } from "@/db";
import { actions } from "@/db/schema";
import type { ActionPayload, NewAction } from "@/db/schema/actions";
import { eq, and, desc, ne, sql, gt, like, isNotNull } from "drizzle-orm";
import { ACTION_STATUS, type ActionType } from "@/lib/constants/statuses";
import { CHECKIN_TITLE_PREFIX } from "@/lib/actions/checkin-proposal";

export type ActionRow = typeof actions.$inferSelect;

/** Input Loki (or any producer) supplies to enqueue a draft action.
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

/**
 * Approved-but-not-yet-executed actions of a given type, oldest first.
 *
 * The local runtime's calendar drain calls this (type=create_event) to find
 * events approved on the cloud control plane — where `gog` isn't present — so it
 * can book them locally. `markActionExecuted` (guarded on status='approved')
 * remains the only path to 'executed', so this list naturally drains as each is
 * booked and is safe to re-poll (a booked row drops out on its next pass).
 */
export async function getApprovedActionsByType(userId: string, type: ActionType) {
  return db
    .select()
    .from(actions)
    .where(
      and(eq(actions.userId, userId), eq(actions.status, ACTION_STATUS.APPROVED), eq(actions.type, type)),
    )
    .orderBy(actions.createdAt);
}

export async function getActionById(userId: string, id: string): Promise<ActionRow | null> {
  const [row] = await db
    .select()
    .from(actions)
    .where(and(eq(actions.id, id), eq(actions.userId, userId)))
    .limit(1);
  return row ?? null;
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

// ── Proactive check-in producer support (see lib/actions/checkin-producer.ts) ──

/**
 * Count pending (draft) check-in proposals for a user. Queue-pressure guard so
 * the proactive producer never floods the approval queue with un-actioned nudges.
 */
export async function countPendingCheckins(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(actions)
    .where(
      and(
        eq(actions.userId, userId),
        eq(actions.status, ACTION_STATUS.DRAFT),
        like(actions.title, `${CHECKIN_TITLE_PREFIX}%`),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Entity ids that already had a check-in proposed within `sinceDays` (ANY
 * status). The per-contact cooldown: a rejected or executed nudge shouldn't be
 * re-proposed the next tick — only after the window lapses. Complements the
 * still-pending dedupe already enforced by proposeAction's unique-draft index.
 */
export async function getEntityIdsWithRecentCheckin(userId: string, sinceDays: number): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ entityId: actions.entityId })
    .from(actions)
    .where(
      and(
        eq(actions.userId, userId),
        isNotNull(actions.entityId),
        like(actions.title, `${CHECKIN_TITLE_PREFIX}%`),
        gt(actions.createdAt, sql`now() - make_interval(days => ${sinceDays})`),
      ),
    );
  return new Set(rows.map((r) => r.entityId).filter((id): id is string => id !== null));
}
