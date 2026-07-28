import { and, count, desc, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, siteFeedback, type SiteFeedback, type NewSiteFeedback } from "@/db/schema";
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";

export async function insertSiteFeedback(values: NewSiteFeedback): Promise<SiteFeedback | null> {
  const [created] = await db.insert(siteFeedback).values(values).returning();
  return created ?? null;
}

/** Inbox for one project, newest first. Owner-scoped by userId. */
export async function listProjectFeedback(userId: string, projectId: string, limit = 200): Promise<SiteFeedback[]> {
  return db.query.siteFeedback.findMany({
    where: and(eq(siteFeedback.userId, userId), eq(siteFeedback.projectId, projectId)),
    orderBy: [desc(siteFeedback.createdAt)],
    limit,
  });
}

export type ProjectFeedbackSummary = {
  projectId: string;
  projectName: string;
  newCount: number;
  latestAt: string;
};

/**
 * Fleet-wide lens over the per-project inboxes: projects with NEW feedback,
 * busiest first. Deliberately a QUERY, not a second store — the token binds
 * every row to its project and that stays the only source of truth.
 */
export async function listFeedbackSummary(userId: string): Promise<ProjectFeedbackSummary[]> {
  const rows = await db
    .select({
      projectId: siteFeedback.projectId,
      projectName: entities.name,
      newCount: count(siteFeedback.id),
      latestAt: max(siteFeedback.createdAt),
    })
    .from(siteFeedback)
    .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
    .where(and(eq(siteFeedback.userId, userId), eq(siteFeedback.status, FEEDBACK_STATUS.NEW)))
    .groupBy(siteFeedback.projectId, entities.name)
    .orderBy(desc(count(siteFeedback.id)), desc(sql`max(${siteFeedback.createdAt})`));
  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    newCount: Number(r.newCount),
    latestAt: (r.latestAt ?? new Date()).toISOString(),
  }));
}

/** One feedback item + its project's name (dispatch needs the tab name). */
export async function getFeedbackWithProject(
  userId: string,
  id: string,
): Promise<{ feedback: SiteFeedback; projectName: string } | null> {
  const [row] = await db
    .select({ feedback: siteFeedback, projectName: entities.name })
    .from(siteFeedback)
    .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
    .where(and(eq(siteFeedback.id, id), eq(siteFeedback.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Status transition (triage). Ownership enforced via userId in the WHERE. */
export async function setFeedbackStatus(
  userId: string,
  id: string,
  status: FeedbackStatus,
  dispatchedRunId?: string,
): Promise<SiteFeedback | null> {
  const [updated] = await db
    .update(siteFeedback)
    .set({ status, ...(dispatchedRunId ? { dispatchedRunId } : {}) })
    .where(and(eq(siteFeedback.id, id), eq(siteFeedback.userId, userId)))
    .returning();
  return updated ?? null;
}
