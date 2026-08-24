import { and, count, desc, eq, getTableColumns, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, siteFeedback, type SiteFeedback, type NewSiteFeedback } from "@/db/schema";
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";

export async function insertSiteFeedback(values: NewSiteFeedback): Promise<SiteFeedback | null> {
  const [created] = await db.insert(siteFeedback).values(values).returning();
  return created ?? null;
}

/**
 * Ingest dedupe: if an OPEN row (new/dispatched — not resolved, not archived)
 * with the same content hash exists for the project, bump its duplicate_count
 * and return its id; the caller then skips the insert. A complaint re-filed
 * AFTER its fix resolved the row is a fresh report (maybe a regression) and
 * gets a new row.
 */
export async function bumpDuplicateFeedback(projectId: string, contentHash: string): Promise<string | null> {
  const [bumped] = await db
    .update(siteFeedback)
    .set({ duplicateCount: sql`${siteFeedback.duplicateCount} + 1` })
    .where(and(
      eq(siteFeedback.projectId, projectId),
      eq(siteFeedback.contentHash, contentHash),
      inArray(siteFeedback.status, [FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.DISPATCHED]),
    ))
    .returning({ id: siteFeedback.id });
  return bumped?.id ?? null;
}

/** Inbox row: everything except the screenshot bytes (kept out of list
 *  payloads), plus a flag so the UI can offer the image on demand. */
export type FeedbackListItem = Omit<SiteFeedback, "screenshot"> & { hasScreenshot: boolean };

/** Inbox for one project, newest first. Owner-scoped by userId. */
export async function listProjectFeedback(userId: string, projectId: string, limit = 200): Promise<FeedbackListItem[]> {
  return db.query.siteFeedback.findMany({
    where: and(eq(siteFeedback.userId, userId), eq(siteFeedback.projectId, projectId)),
    orderBy: [desc(siteFeedback.createdAt)],
    limit,
    columns: { screenshot: false },
    extras: { hasScreenshot: sql<boolean>`(${siteFeedback.screenshot} IS NOT NULL)`.as("has_screenshot") },
  });
}

/**
 * The feedback loop in numbers: how much lands, how much ships, and how fast
 * report becomes fix. Median (not avg) via percentile_cont so one slow outlier
 * can't wreck the story. On-demand aggregate — no metrics infrastructure.
 */
export type FeedbackLoopMetrics = {
  total: number;
  open: number;
  resolved: number;
  resolved30d: number;
  medianResolutionHours: number | null;
};

export async function getFeedbackLoopMetrics(userId: string, projectId?: string): Promise<FeedbackLoopMetrics> {
  const where = projectId
    ? and(eq(siteFeedback.userId, userId), eq(siteFeedback.projectId, projectId))
    : eq(siteFeedback.userId, userId);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${siteFeedback.status} in (${FEEDBACK_STATUS.NEW}, ${FEEDBACK_STATUS.DISPATCHED}))::int`,
      resolved: sql<number>`count(*) filter (where ${siteFeedback.status} = ${FEEDBACK_STATUS.RESOLVED})::int`,
      resolved30d: sql<number>`count(*) filter (where ${siteFeedback.status} = ${FEEDBACK_STATUS.RESOLVED} and ${siteFeedback.resolvedAt} > now() - interval '30 days')::int`,
      medianResolutionHours: sql<number | null>`extract(epoch from percentile_cont(0.5) within group (order by (${siteFeedback.resolvedAt} - ${siteFeedback.createdAt})) filter (where ${siteFeedback.resolvedAt} is not null)) / 3600`,
    })
    .from(siteFeedback)
    .where(where);
  return {
    total: row?.total ?? 0,
    open: row?.open ?? 0,
    resolved: row?.resolved ?? 0,
    resolved30d: row?.resolved30d ?? 0,
    medianResolutionHours: row?.medianResolutionHours != null ? Number(row.medianResolutionHours) : null,
  };
}

/** Operator curation toggle for the public strip — resolved rows only. */
export async function setFeedbackFeatured(userId: string, id: string, featured: boolean): Promise<boolean> {
  const [updated] = await db
    .update(siteFeedback)
    .set({ featuredAt: featured ? new Date() : null })
    .where(and(
      eq(siteFeedback.id, id),
      eq(siteFeedback.userId, userId),
      eq(siteFeedback.status, FEEDBACK_STATUS.RESOLVED),
    ))
    .returning({ id: siteFeedback.id });
  return !!updated;
}

/** The screenshot bytes for one row (owner-scoped) — the ONLY reader of the
 *  screenshot column. */
export async function getFeedbackScreenshot(userId: string, id: string): Promise<string | null> {
  const [row] = await db
    .select({ screenshot: siteFeedback.screenshot })
    .from(siteFeedback)
    .where(and(eq(siteFeedback.id, id), eq(siteFeedback.userId, userId)))
    .limit(1);
  return row?.screenshot ?? null;
}

/** Cross-project inbox row: the list shape plus which project it belongs to. */
export type UserFeedbackListItem = FeedbackListItem & { projectName: string };

/**
 * Every project's inbox in one read — the lens behind /feedback. Same
 * screenshot exclusion as the per-project list; the join supplies the project
 * name so the UI never needs a second lookup. Newest first across the fleet.
 */
export async function listUserFeedback(userId: string, limit = 400): Promise<UserFeedbackListItem[]> {
  const { screenshot: _screenshot, ...cols } = getTableColumns(siteFeedback);
  return db
    .select({
      ...cols,
      hasScreenshot: sql<boolean>`(${siteFeedback.screenshot} IS NOT NULL)`.as("has_screenshot"),
      projectName: entities.name,
    })
    .from(siteFeedback)
    .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
    .where(eq(siteFeedback.userId, userId))
    .orderBy(desc(siteFeedback.createdAt))
    .limit(limit);
}

export type ProjectFeedbackSummary = {
  projectId: string;
  projectName: string;
  newCount: number;
  /** new + dispatched — what the Control strip keys on so a project doesn't
   *  vanish mid-watch the moment its last NEW item is implemented. */
  openCount: number;
  latestAt: string;
};

/**
 * Fleet-wide lens over the per-project inboxes: projects with NEW feedback,
 * busiest first. Deliberately a QUERY, not a second store — the token binds
 * every row to its project and that stays the only source of truth.
 */
export async function listFeedbackSummary(userId: string): Promise<ProjectFeedbackSummary[]> {
  // OPEN rows (new + dispatched), split into both counts in one pass. NEW-only
  // here made the Control strip's project chip vanish the moment "Implement"
  // flipped its last NEW row to dispatched — exactly while the operator was
  // watching the fix run it promised to show.
  const rows = await db
    .select({
      projectId: siteFeedback.projectId,
      projectName: entities.name,
      newCount: sql<number>`count(*) filter (where ${siteFeedback.status} = ${FEEDBACK_STATUS.NEW})::int`,
      openCount: count(siteFeedback.id),
      latestAt: max(siteFeedback.createdAt),
    })
    .from(siteFeedback)
    .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
    .where(and(
      eq(siteFeedback.userId, userId),
      inArray(siteFeedback.status, [FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.DISPATCHED]),
    ))
    .groupBy(siteFeedback.projectId, entities.name)
    .orderBy(desc(count(siteFeedback.id)), desc(sql`max(${siteFeedback.createdAt})`));
  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    newCount: Number(r.newCount),
    openCount: Number(r.openCount),
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

/**
 * Bulk NEW→dispatched with run linkage — used when a digester DISPATCH_PROMPT
 * executes, so close-the-loop can auto-resolve the clustered items when the
 * run succeeds. Only rows still 'new' flip (an item the operator triaged in
 * the meantime is not clobbered).
 */
export async function markFeedbackDispatchedBulk(
  userId: string,
  ids: string[],
  runId?: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(siteFeedback)
    .set({ status: FEEDBACK_STATUS.DISPATCHED, ...(runId ? { dispatchedRunId: runId } : {}) })
    .where(and(
      eq(siteFeedback.userId, userId),
      inArray(siteFeedback.id, ids),
      eq(siteFeedback.status, FEEDBACK_STATUS.NEW),
    ))
    .returning({ id: siteFeedback.id });
  return rows.length;
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
    .set({
      status,
      ...(dispatchedRunId ? { dispatchedRunId } : {}),
      // Resolution evidence: stamp when the row resolves, clear on reopen so a
      // re-resolved row never shows a stale date.
      resolvedAt: status === FEEDBACK_STATUS.RESOLVED ? new Date()
        : status === FEEDBACK_STATUS.NEW ? null
        : undefined,
    })
    .where(and(eq(siteFeedback.id, id), eq(siteFeedback.userId, userId)))
    .returning();
  return updated ?? null;
}
