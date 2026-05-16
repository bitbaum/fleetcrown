import {
  DEFAULT_USER_EXTERNAL_ID,
  GOALS_DUE_SOON_DAYS,
  EVENTS_DUE_SOON_DAYS,
  SUBSCRIPTIONS_UPCOMING_DAYS,
} from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { db } from "@/db";
import { commitments, subscriptions, goals, alerts, actions, events, projectStates, orchestrationRuns } from "@/db/schema";
import { eq, and, lte, isNotNull, gte, desc, sql } from "drizzle-orm";
import { HEALTH_FADING_DAYS } from "@/lib/constants/people";
import { GOAL_STATUS, SUB_STATUS, COMMITMENT_STATUS, ACTION_STATUS, ALERT_SEVERITY, EVENT_STATUS, HABIT_FREQUENCY } from "@/lib/constants/statuses";
import { READY_WINDOW_S, PROMPT_RUNNING_WINDOW_S, getHealthShort, isHealthPoor } from "@/lib/constants/control";
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
type PatchCommitmentInput = z.infer<typeof PatchCommitmentBody>;

export async function createCommitment(userId: string, data: CreateCommitmentInput, source?: string) {
  const [created] = await db
    .insert(commitments)
    .values({
      userId,
      description: data.description,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      financialImpact: data.financialImpact || null,
      status: COMMITMENT_STATUS.ACTIVE,
      source: source ?? null,
    })
    .returning();
  return created;
}

export async function patchCommitment(userId: string, id: string, data: PatchCommitmentInput) {
  const patch: Partial<typeof commitments.$inferInsert> = { updatedAt: new Date() };
  if (data.description !== undefined) patch.description = data.description;
  if (data.dueDate !== undefined) patch.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.financialImpact !== undefined) patch.financialImpact = data.financialImpact?.trim() || null;
  const [updated] = await db
    .update(commitments)
    .set(patch)
    .where(and(eq(commitments.id, id), eq(commitments.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function deleteCommitment(userId: string, id: string) {
  await db.delete(commitments).where(and(eq(commitments.id, id), eq(commitments.userId, userId)));
}

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
          h.frequency = ${HABIT_FREQUENCY.DAILY}
          OR (h.frequency = ${HABIT_FREQUENCY.WEEKDAYS} AND EXTRACT(DOW FROM now()) BETWEEN 1 AND 5)
          OR (h.frequency = ${HABIT_FREQUENCY.WEEKLY}   AND EXTRACT(DOW FROM now()) = 1)
        )
    `),
    db.execute<{ count: string }>(sql`
      SELECT count(*)::text as count FROM (
        SELECT e.id
        FROM entities e
        JOIN interactions i ON i.entity_id = e.id AND i.user_id = ${userId}
        WHERE e.user_id = ${userId} AND e.type = ${ENTITY_TYPE.PERSON} AND (e.external_id IS NULL OR e.external_id != ${DEFAULT_USER_EXTERNAL_ID})
        GROUP BY e.id
        HAVING max(i.occurred_at) < now() - make_interval(days => ${HEALTH_FADING_DAYS})
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

/** Counts agents with an active prompt (running) or recently finished (ready/waiting).
 *  Uses project_states DB only — no process scanning — so it's fast and safe for server components.
 *  Cutoffs are sourced from lib/constants/control so DB counts stay in sync with UI banner windows. */
export async function getFleetSummary(userId: string) {
  const cutoffRunning = new Date(Date.now() - PROMPT_RUNNING_WINDOW_S * 1000);
  const cutoffWaiting = new Date(Date.now() - READY_WINDOW_S * 1000);

  const rows = await db
    .select({
      currentPromptStartedAt: projectStates.currentPromptStartedAt,
      readyAt: projectStates.readyAt,
      sessionHealth: projectStates.sessionHealth,
    })
    .from(projectStates)
    .where(eq(projectStates.userId, userId));

  let running = 0;
  let waiting = 0;
  let degraded = 0;
  for (const r of rows) {
    if (r.currentPromptStartedAt && r.currentPromptStartedAt > cutoffRunning) {
      running++;
    } else if (r.readyAt && r.readyAt > cutoffWaiting) {
      waiting++;
    }
    if (r.sessionHealth) {
      const short = getHealthShort(r.sessionHealth);
      if (isHealthPoor(short)) degraded++;
    }
  }
  return { running, waiting, degraded };
}

export async function getRecentOrchestrationRuns(userId: string, hours = 24, limit = 6) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db
    .select({
      id: orchestrationRuns.id,
      projectKey: orchestrationRuns.projectKey,
      state: orchestrationRuns.state,
      summary: orchestrationRuns.summary,
      finishedAt: orchestrationRuns.finishedAt,
    })
    .from(orchestrationRuns)
    .where(
      and(
        eq(orchestrationRuns.userId, userId),
        isNotNull(orchestrationRuns.finishedAt),
        gte(orchestrationRuns.finishedAt, since),
      ),
    )
    .orderBy(desc(orchestrationRuns.finishedAt))
    .limit(limit);
}
