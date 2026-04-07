import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { commitments, events, subscriptions, goals, alerts, actions } from "@/db/schema";
import { eq, and, lte, gte, sql } from "drizzle-orm";

export async function getActiveCommitments() {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, DEFAULT_USER_ID),
        eq(commitments.status, "active"),
      ),
    )
    .orderBy(commitments.dueDate);
}

export async function getUpcomingEvents(days = 7) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, DEFAULT_USER_ID),
        eq(events.status, "active"),
        gte(events.dateStart, now),
        lte(events.dateStart, future),
      ),
    )
    .orderBy(events.dateStart);
}

export async function getUpcomingSubscriptions(days = 7) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, DEFAULT_USER_ID),
        eq(subscriptions.status, "active"),
        lte(subscriptions.nextDue, future),
      ),
    )
    .orderBy(subscriptions.nextDue);
}

export async function getTodaySummary() {
  const [goalStats] = await db
    .select({
      active: sql<number>`count(*)`,
      avgProgress: sql<number>`coalesce(avg(${goals.progress}), 0)`,
    })
    .from(goals)
    .where(and(eq(goals.userId, DEFAULT_USER_ID), eq(goals.status, "active")));

  const [alertStats] = await db
    .select({ total: sql<number>`count(*)` })
    .from(alerts)
    .where(and(eq(alerts.userId, DEFAULT_USER_ID), eq(alerts.dismissed, false)));

  const [urgentStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alerts)
    .where(and(eq(alerts.userId, DEFAULT_USER_ID), eq(alerts.dismissed, false), eq(alerts.severity, "urgent")));

  const [actionStats] = await db
    .select({ drafts: sql<number>`count(*)` })
    .from(actions)
    .where(and(eq(actions.userId, DEFAULT_USER_ID), eq(actions.status, "draft")));

  const [overdueStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commitments)
    .where(and(
      eq(commitments.userId, DEFAULT_USER_ID),
      eq(commitments.status, "active"),
      lte(commitments.dueDate, new Date()),
    ));

  return {
    activeGoals: Number(goalStats.active),
    avgGoalProgress: Math.round(Number(goalStats.avgProgress)),
    activeAlerts: Number(alertStats.total),
    urgentAlerts: Number(urgentStats.count),
    pendingDrafts: Number(actionStats.drafts),
    overdueCommitments: Number(overdueStats.count),
  };
}
