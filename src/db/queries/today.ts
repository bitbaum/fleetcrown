import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { commitments, subscriptions, goals, alerts, actions } from "@/db/schema";
import { eq, and, lte, isNotNull, sql } from "drizzle-orm";

export async function fulfillCommitment(id: string) {
  await db
    .update(commitments)
    .set({ status: "fulfilled", updatedAt: new Date() })
    .where(and(eq(commitments.id, id), eq(commitments.userId, DEFAULT_USER_ID)));
}

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
      eq(goals.status, "active"),
      isNotNull(goals.targetDate),
      lte(goals.targetDate, soon),
    ))
    .orderBy(goals.targetDate);
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
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);

  const [
    [goalStats],
    [alertStats],
    [urgentStats],
    [actionStats],
    [overdueStats],
    [goalsDueSoonStats],
  ] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*)`,
        avgProgress: sql<number>`coalesce(avg(${goals.progress}), 0)`,
      })
      .from(goals)
      .where(and(eq(goals.userId, DEFAULT_USER_ID), eq(goals.status, "active"))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(alerts)
      .where(and(eq(alerts.userId, DEFAULT_USER_ID), eq(alerts.dismissed, false))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(eq(alerts.userId, DEFAULT_USER_ID), eq(alerts.dismissed, false), eq(alerts.severity, "urgent"))),
    db
      .select({ drafts: sql<number>`count(*)` })
      .from(actions)
      .where(and(eq(actions.userId, DEFAULT_USER_ID), eq(actions.status, "draft"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(commitments)
      .where(and(
        eq(commitments.userId, DEFAULT_USER_ID),
        eq(commitments.status, "active"),
        lte(commitments.dueDate, new Date()),
      )),
    // Goals with a target date within the next 14 days
    db
      .select({ count: sql<number>`count(*)` })
      .from(goals)
      .where(and(
        eq(goals.userId, DEFAULT_USER_ID),
        eq(goals.status, "active"),
        isNotNull(goals.targetDate),
        lte(goals.targetDate, soon),
      )),
  ]);

  return {
    activeGoals: Number(goalStats.active),
    avgGoalProgress: Math.round(Number(goalStats.avgProgress)),
    activeAlerts: Number(alertStats.total),
    urgentAlerts: Number(urgentStats.count),
    pendingDrafts: Number(actionStats.drafts),
    overdueCommitments: Number(overdueStats.count),
    goalsDueSoon: Number(goalsDueSoonStats.count),
  };
}
