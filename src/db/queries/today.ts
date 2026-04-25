import { DEFAULT_USER_ID, DEFAULT_USER_EXTERNAL_ID } from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { db } from "@/db";
import { commitments, subscriptions, goals, alerts, actions, events } from "@/db/schema";
import { eq, and, lte, isNotNull, sql } from "drizzle-orm";
import { HEALTH_ACTIVE_DAYS } from "@/lib/utils";
import { GOAL_STATUS, SUB_STATUS, COMMITMENT_STATUS, ACTION_STATUS, ALERT_SEVERITY, EVENT_STATUS } from "@/lib/constants/statuses";

export async function fulfillCommitment(id: string) {
  await db
    .update(commitments)
    .set({ status: COMMITMENT_STATUS.FULFILLED, updatedAt: new Date() })
    .where(and(eq(commitments.id, id), eq(commitments.userId, DEFAULT_USER_ID)));
}

export async function getActiveCommitments() {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, DEFAULT_USER_ID),
        eq(commitments.status, COMMITMENT_STATUS.ACTIVE),
      ),
    )
    .orderBy(commitments.dueDate);
}

export async function getGoalsDueSoon(days = 14) {
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
      eq(goals.userId, DEFAULT_USER_ID),
      eq(goals.status, GOAL_STATUS.ACTIVE),
      isNotNull(goals.targetDate),
      lte(goals.targetDate, soon),
    ))
    .orderBy(goals.targetDate);
}

export async function getUpcomingSubscriptions(days = 7) {
  const future = new Date();
  future.setDate(future.getDate() + days);

  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, DEFAULT_USER_ID),
        eq(subscriptions.status, SUB_STATUS.ACTIVE),
        lte(subscriptions.nextDue, future),
      ),
    )
    .orderBy(subscriptions.nextDue);
}

export async function getTodaySummary() {
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);

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
      .where(and(eq(goals.userId, DEFAULT_USER_ID), eq(goals.status, GOAL_STATUS.ACTIVE))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(alerts)
      .where(and(eq(alerts.userId, DEFAULT_USER_ID), eq(alerts.dismissed, false))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(eq(alerts.userId, DEFAULT_USER_ID), eq(alerts.dismissed, false), eq(alerts.severity, ALERT_SEVERITY.URGENT))),
    db
      .select({ drafts: sql<number>`count(*)` })
      .from(actions)
      .where(and(eq(actions.userId, DEFAULT_USER_ID), eq(actions.status, ACTION_STATUS.DRAFT))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(commitments)
      .where(and(
        eq(commitments.userId, DEFAULT_USER_ID),
        eq(commitments.status, COMMITMENT_STATUS.ACTIVE),
        lte(commitments.dueDate, new Date()),
      )),
    // Goals with a target date within the next 14 days
    db
      .select({ count: sql<number>`count(*)` })
      .from(goals)
      .where(and(
        eq(goals.userId, DEFAULT_USER_ID),
        eq(goals.status, GOAL_STATUS.ACTIVE),
        isNotNull(goals.targetDate),
        lte(goals.targetDate, soon),
      )),
    // Events with a deadline within the next 30 days
    db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(and(
        eq(events.userId, DEFAULT_USER_ID),
        eq(events.status, EVENT_STATUS.ACTIVE),
        isNotNull(events.deadline),
        lte(events.deadline, (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })()),
      )),
    // Habits due today and how many are done — frequency logic in SQL
    db.execute<{ total: string; done: string }>(sql`
      SELECT
        count(*)::text AS total,
        count(hc.id)::text AS done
      FROM habits h
      LEFT JOIN habit_completions hc
        ON hc.habit_id = h.id
        AND hc.completed_date = current_date
        AND hc.user_id = ${DEFAULT_USER_ID}
      WHERE h.user_id = ${DEFAULT_USER_ID}
        AND h.active = true
        AND (
          h.frequency = 'daily'
          OR (h.frequency = 'weekdays' AND EXTRACT(DOW FROM now()) BETWEEN 1 AND 5)
          OR (h.frequency = 'weekly'   AND EXTRACT(DOW FROM now()) = 1)
        )
    `),
    // People with no interaction in the last HEALTH_ACTIVE_DAYS days (fading + stale + unknown)
    db.execute<{ count: string }>(sql`
      SELECT count(*)::text as count FROM (
        SELECT e.id
        FROM entities e
        LEFT JOIN interactions i ON i.entity_id = e.id AND i.user_id = ${DEFAULT_USER_ID}
        WHERE e.user_id = ${DEFAULT_USER_ID} AND e.type = ${ENTITY_TYPE.PERSON} AND e.external_id != ${DEFAULT_USER_EXTERNAL_ID}
        GROUP BY e.id
        HAVING max(i.occurred_at) < now() - make_interval(days => ${HEALTH_ACTIVE_DAYS})
            OR max(i.occurred_at) IS NULL
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
