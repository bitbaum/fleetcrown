import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities, siteFeedback, type SiteFeedback, type NewSiteFeedback } from "@/db/schema";
import { type FeedbackStatus } from "@/lib/constants/statuses";

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
