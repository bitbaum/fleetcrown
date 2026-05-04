import {
  DEFAULT_USER_EXTERNAL_ID,
  GOALS_DUE_SOON_DAYS,
  EVENTS_DUE_SOON_DAYS,
  SUBSCRIPTIONS_UPCOMING_DAYS,
} from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { db } from "@/db";
import { commitments, subscriptions, goals, alerts, actions, events } from "@/db/schema";
import { eq, and, lte, isNotNull, sql } from "drizzle-orm";
import { HEALTH_ACTIVE_DAYS } from "@/lib/utils";
import { GOAL_STATUS, SUB_STATUS, COMMITMENT_STATUS, ACTION_STATUS, ALERT_SEVERITY, EVENT_STATUS } from "@/lib/constants/statuses";
import { z } from "zod";

export const CreateCommitmentBody = z.object({
  description: z.string().trim().min(1, "description is required"),
  dueDate: z.string().optional(),
  financialImpact: z.string().trim().optional(),
});

export const PatchCommitmentBody = z.object({
  description: z.string().trim().min(1, "description cannot be empty").optional(),
  dueDate: z.string().nullable().optional(),
  financialImpact: z.string().nullable().optional(),
});

export type CreateCommitmentInput = z.infer<typeof CreateCommitmentBody>;

export async function fulfillCommitment(id: string, userId: string) {
  await db
    .update(commitments)
    .set({ status: COMMITMENT_STATUS.FULFILLED, updatedAt: new Date() })
    .where(and(eq(commitments.id, id), eq(commitments.userId, userId)));
}

export async function getActiveCommitments(userId: string) {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, userId),
        eq(commitments.status, COMMITMENT_STATUS.ACTIVE),
      ),
    )
    .orderBy(commitments.dueDate);
}

export async function getGoalsDueSoon(userId: string, days = GOALS_DUE_SOON_DAYS) {
  const soon = new Date();
  soon.setDate(soon.getDate() + days);

  return db
    .select({
      id: goals.id,
      title: goals.title,
      progress: goals.progress,
      targetDate: goals.targetDate,
    })
    .from(goals)
    .where(and(
      eq(goals.userId, userId),
      eq(goals.status, GOAL_STATUS.ACTIVE),
      isNotNull(goals.targetDate),
      lte(goals.targetDate, soon),
    ))
    .orderBy(goals.targetDate);
}

export async function getUpcomingSubscriptions(userId: string, days = SUBSCRIPTIONS_UPCOMING_DAYS) {
  const future = new Date();
  future.setDate(future.getDate() + days);

  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, SUB_STATUS.ACTIVE),
        lte(subscriptions.nextDue, future),
      ),
    )
    .orderBy(subscriptions.nextDue);
}

export async function getTodaySummary(userId: string) {
  const goalsSoon = new Date();
  goalsSoon.setDate(goalsSoon.getDate() + GOALS_DUE_SOON_DAYS);

  const eventsSoon = new Date();
  eventsSoon.setDate(eventsSoon.getDate() + EVENTS_DUE_SOON_DAYS);

  const [
    [goalStats],
    [alertStats],
    [urgentStats],
    [actionStats],
    [overdueStats],
    [goalsDueSoonStats],
    [eventsDueSoonStats],
    habitStatsResult,
    staleContactsResult,
  ] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*)`,
        avgProgress: sql<number>`coalesce(avg(${goals.progress}), 0)`,
      })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, GOAL_STATUS.ACTIVE))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(alerts)
      .where(and(eq(alerts.userId, userId), eq(alerts.dismissed, false))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(eq(alerts.userId, userId), eq(alerts.dismissed, false), eq(alerts.severity, ALERT_SEVERITY.URGENT))),
    db
      .select({ drafts: sql<number>`count(*)` })
      .from(actions)
      .where(and(eq(actions.userId, userId), eq(actions.status, ACTION_STATUS.DRAFT))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(commitments)
      .where(and(
        eq(commitments.userId, userId),
        eq(commitments.status, COMMITMENT_STATUS.ACTIVE),
        lte(commitments.dueDate, new Date()),
      )),
    db
      .select({ count: sql<number>`count(*)` })
      .from(goals)
      .where(and(
        eq(goals.userId, userId),
        eq(goals.status, GOAL_STATUS.ACTIVE),
        isNotNull(goals.targetDate),
        lte(goals.targetDate, goalsSoon),
      )),
    db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(and(
        eq(events.userId, userId),
        eq(events.status, EVENT_STATUS.ACTIVE),
        isNotNull(events.deadline),
        lte(events.deadline, eventsSoon),
      )),
    db.execute<{ total: string; done: string }>(sql`
      SELECT
        count(*)::text AS total,
        count(hc.id)::text AS done
      FROM habits h
      LEFT JOIN habit_completions hc
        ON hc.habit_id = h.id
        AND hc.completed_date = current_date
        AND hc.user_id = ${userId}
      WHERE h.user_id = ${userId}
        AND h.active = true
        AND (
          h.frequency = 'daily'
          OR (h.frequency = 'weekdays' AND EXTRACT(DOW FROM now()) BETWEEN 1 AND 5)
          OR (h.frequency = 'weekly'   AND EXTRACT(DOW FROM now()) = 1)
        )
    `),
    db.execute<{ count: string }>(sql`
      SELECT count(*)::text as count FROM (
        SELECT e.id
        FROM entities e
        JOIN interactions i ON i.entity_id = e.id AND i.user_id = ${userId}
        WHERE e.user_id = ${userId} AND e.type = ${ENTITY_TYPE.PERSON} AND e.external_id != ${DEFAULT_USER_EXTERNAL_ID}
        GROUP BY e.id
        HAVING max(i.occurred_at) < now() - make_interval(days => ${HEALTH_ACTIVE_DAYS})
      ) sub
    `),
  ]);

  const staleContacts = Number((staleContactsResult[0] as { count: string } | undefined)?.count ?? 0);
  const habitRow = habitStatsResult[0] as { total: string; done: string } | undefined;

  return {
    activeGoals: Number(goalStats.active),
    avgGoalProgress: Math.round(Number(goalStats.avgProgress)),
    activeAlerts: Number(alertStats.total),
    urgentAlerts: Number(urgentStats.count),
    pendingDrafts: Number(actionStats.drafts),
    overdueCommitments: Number(overdueStats.count),
    goalsDueSoon: Number(goalsDueSoonStats.count),
    eventsDueSoon: Number(eventsDueSoonStats.count),
    staleContacts,
    habitsTotal: Number(habitRow?.total ?? 0),
    habitsDone: Number(habitRow?.done ?? 0),
  };
}
