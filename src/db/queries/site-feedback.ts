import { and, count, desc, eq, getTableColumns, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  entities,
  siteFeedback,
  userProjects,
  type SiteFeedback,
  type NewSiteFeedback,
} from "@/db/schema";
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
export async function bumpDuplicateFeedback(
  projectId: string,
  contentHash: string,
): Promise<string | null> {
  const [bumped] = await db
    .update(siteFeedback)
    .set({ duplicateCount: sql`${siteFeedback.duplicateCount} + 1` })
    .where(
      and(
        eq(siteFeedback.projectId, projectId),
        eq(siteFeedback.contentHash, contentHash),
        inArray(siteFeedback.status, [FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.DISPATCHED]),
      ),
    )
    .returning({ id: siteFeedback.id });
  return bumped?.id ?? null;
}

/** Inbox row: everything except the screenshot bytes (kept out of list
 *  payloads), plus a flag so the UI can offer the images on demand. */
export type FeedbackListItem = Omit<SiteFeedback, "screenshots"> & {
  hasScreenshots: boolean;
  /** The project's public URL (user_projects.live_url) — where "Check live"
   *  opens, with the reported path. The reported host is only a fallback. */
  liveUrl: string | null;
  /** The project has somewhere for an agent to work (a folder or a
   *  repository). False = Implement would launch an agent into nothing, so the
   *  row says so instead of letting the run fail later. */
  runnable: boolean;
};

/** Inbox for one project, newest first. Owner-scoped by userId. */
export async function listProjectFeedback(
  userId: string,
  projectId: string,
  limit = 200,
): Promise<FeedbackListItem[]> {
  return db.query.siteFeedback.findMany({
    where: and(eq(siteFeedback.userId, userId), eq(siteFeedback.projectId, projectId)),
    orderBy: [desc(siteFeedback.createdAt)],
    limit,
    columns: { screenshots: false },
    extras: {
      hasScreenshots:
        sql<boolean>`(${siteFeedback.screenshots} IS NOT NULL AND jsonb_array_length(${siteFeedback.screenshots}) > 0)`.as(
          "has_screenshots",
        ),
      liveUrl: sql<string | null>`(
        SELECT ${userProjects.liveUrl} FROM ${userProjects}
        WHERE ${userProjects.entityProjectId} = ${siteFeedback.projectId}
          AND ${userProjects.userId} = ${siteFeedback.userId}
          AND ${userProjects.isActive} = true
        ORDER BY ${userProjects.createdAt} ASC LIMIT 1
      )`.as("live_url"),
      // Same flag the cross-project inbox carries. Without it this surface
      // offered Implement on a project with nowhere for an agent to work and
      // the operator got a 422 toast instead of the sentence telling them to
      // connect a repository — the same row behaving differently in two places.
      runnable: sql<boolean>`EXISTS (
        SELECT 1 FROM ${userProjects}
        WHERE ${userProjects.entityProjectId} = ${siteFeedback.projectId}
          AND ${userProjects.userId} = ${siteFeedback.userId}
          AND ${userProjects.isActive} = true
          AND (${userProjects.dirPath} IS NOT NULL OR ${userProjects.gitUrl} IS NOT NULL)
      )`.as("runnable"),
    },
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

export async function getFeedbackLoopMetrics(
  userId: string,
  projectId?: string,
): Promise<FeedbackLoopMetrics> {
  const where = projectId
    ? and(eq(siteFeedback.userId, userId), eq(siteFeedback.projectId, projectId))
    : eq(siteFeedback.userId, userId);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${siteFeedback.status} in (${FEEDBACK_STATUS.NEW}, ${FEEDBACK_STATUS.DISPATCHED}))::int`,
      resolved: sql<number>`count(*) filter (where ${siteFeedback.status} = ${FEEDBACK_STATUS.RESOLVED})::int`,
      resolved30d: sql<number>`count(*) filter (where ${siteFeedback.status} = ${FEEDBACK_STATUS.RESOLVED} and ${siteFeedback.resolvedAt} > now() - interval '30 days')::int`,
      medianResolutionHours: sql<
        number | null
      >`extract(epoch from percentile_cont(0.5) within group (order by (${siteFeedback.resolvedAt} - ${siteFeedback.createdAt})) filter (where ${siteFeedback.resolvedAt} is not null)) / 3600`,
    })
    .from(siteFeedback)
    .where(where);
  return {
    total: row?.total ?? 0,
    open: row?.open ?? 0,
    resolved: row?.resolved ?? 0,
    resolved30d: row?.resolved30d ?? 0,
    medianResolutionHours:
      row?.medianResolutionHours != null ? Number(row.medianResolutionHours) : null,
  };
}

/** Operator curation toggle for the public strip — resolved rows only. */
export async function setFeedbackFeatured(
  userId: string,
  id: string,
  featured: boolean,
): Promise<boolean> {
  const [updated] = await db
    .update(siteFeedback)
    .set({ featuredAt: featured ? new Date() : null })
    .where(
      and(
        eq(siteFeedback.id, id),
        eq(siteFeedback.userId, userId),
        eq(siteFeedback.status, FEEDBACK_STATUS.RESOLVED),
      ),
    )
    .returning({ id: siteFeedback.id });
  return !!updated;
}

/** The screenshot bytes for one row (owner-scoped) — the ONLY reader of the
 *  screenshots column. */
export async function getFeedbackScreenshots(userId: string, id: string): Promise<string[] | null> {
  const [row] = await db
    .select({ screenshots: siteFeedback.screenshots })
    .from(siteFeedback)
    .where(and(eq(siteFeedback.id, id), eq(siteFeedback.userId, userId)))
    .limit(1);
  return row?.screenshots ?? null;
}

/** Cross-project inbox row: the list shape plus which project it belongs to. */
export type UserFeedbackListItem = FeedbackListItem & { projectName: string };

/**
 * Every project's inbox in one read — the lens behind /feedback. Same
 * screenshots exclusion as the per-project list; the join supplies the project
 * name so the UI never needs a second lookup. Newest first across the fleet.
 */
export async function listUserFeedback(
  userId: string,
  limit = 400,
): Promise<UserFeedbackListItem[]> {
  const { screenshots: _screenshots, ...cols } = getTableColumns(siteFeedback);
  return db
    .select({
      ...cols,
      hasScreenshots:
        sql<boolean>`(${siteFeedback.screenshots} IS NOT NULL AND jsonb_array_length(${siteFeedback.screenshots}) > 0)`.as(
          "has_screenshots",
        ),
      projectName: entities.name,
      liveUrl: sql<string | null>`(
        SELECT ${userProjects.liveUrl} FROM ${userProjects}
        WHERE ${userProjects.entityProjectId} = ${entities.id}
          AND ${userProjects.userId} = ${siteFeedback.userId}
          AND ${userProjects.isActive} = true
        ORDER BY ${userProjects.createdAt} ASC LIMIT 1
      )`.as("live_url"),
      runnable: sql<boolean>`EXISTS (
        SELECT 1 FROM ${userProjects}
        WHERE ${userProjects.entityProjectId} = ${entities.id}
          AND ${userProjects.userId} = ${siteFeedback.userId}
          AND ${userProjects.isActive} = true
          AND (${userProjects.dirPath} IS NOT NULL OR ${userProjects.gitUrl} IS NOT NULL)
      )`.as("runnable"),
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
    .where(
      and(
        eq(siteFeedback.userId, userId),
        inArray(siteFeedback.status, [FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.DISPATCHED]),
      ),
    )
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

/** Feedback plus its registered worker project. An entity alone cannot execute work. */
export async function getFeedbackWithProject(
  userId: string,
  id: string,
): Promise<{
  feedback: SiteFeedback;
  projectName: string;
  userProjectId: string | null;
  agentPref: string | null;
  /** A folder or a repository — somewhere for the agent to work. */
  hasWorkspace: boolean;
} | null> {
  const [row] = await db
    .select({
      feedback: siteFeedback,
      projectName: entities.name,
      userProjectName: userProjects.name,
      userProjectId: userProjects.id,
      agentPref: userProjects.agentPref,
      hasWorkspace: sql<boolean>`(${userProjects.dirPath} IS NOT NULL OR ${userProjects.gitUrl} IS NOT NULL)`,
    })
    .from(siteFeedback)
    .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
    .leftJoin(
      userProjects,
      and(
        eq(userProjects.entityProjectId, siteFeedback.projectId),
        eq(userProjects.userId, userId),
        eq(userProjects.isActive, true),
      ),
    )
    .where(and(eq(siteFeedback.id, id), eq(siteFeedback.userId, userId)))
    .limit(1);
  if (!row) return null;
  // The name is display/transport context; dispatch addresses feedback.projectId.
  return {
    feedback: row.feedback,
    projectName: row.userProjectName ?? row.projectName,
    userProjectId: row.userProjectId,
    agentPref: row.agentPref ?? null,
    hasWorkspace: row.hasWorkspace === true,
  };
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
    .where(
      and(
        eq(siteFeedback.userId, userId),
        inArray(siteFeedback.id, ids),
        eq(siteFeedback.status, FEEDBACK_STATUS.NEW),
      ),
    )
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
      resolvedAt:
        status === FEEDBACK_STATUS.RESOLVED
          ? new Date()
          : status === FEEDBACK_STATUS.NEW
            ? null
            : undefined,
    })
    .where(and(eq(siteFeedback.id, id), eq(siteFeedback.userId, userId)))
    .returning();
  return updated ?? null;
}

// ─── The sender side ────────────────────────────────────────────────────────
// Everything above answers "what did I RECEIVE" and is scoped by
// siteFeedback.userId (the project owner). Everything below answers "what did
// I SEND" and is scoped by submitterUserId / submitterEmail / trackToken.
// The two must never share a scoping helper — that is how one person's inbox
// would end up rendered as another person's outbox.

/** One report as its own reporter sees it: their text, where they filed it,
 *  and enough of the project to name the site back to them. Deliberately NOT
 *  FeedbackListItem — that carries operator-only fields (runnable, contact of
 *  other reporters is not here but the shape invites drift). */
export type SentFeedbackItem = Omit<SiteFeedback, "screenshots" | "contact" | "userAgent"> & {
  hasScreenshots: boolean;
  projectName: string;
  liveUrl: string | null;
};

const sentColumns = () => {
  const {
    screenshots: _screenshots,
    contact: _contact,
    userAgent: _userAgent,
    ...cols
  } = getTableColumns(siteFeedback);
  return cols;
};

const hasScreenshotsSql = sql<boolean>`(${siteFeedback.screenshots} IS NOT NULL AND jsonb_array_length(${siteFeedback.screenshots}) > 0)`;

/** The project's public URL, via its OWNER's registration — the owner is
 *  siteFeedback.userId, never the reporter. */
const projectLiveUrlSql = sql<string | null>`(
  SELECT ${userProjects.liveUrl} FROM ${userProjects}
  WHERE ${userProjects.entityProjectId} = ${entities.id}
    AND ${userProjects.userId} = ${siteFeedback.userId}
    AND ${userProjects.isActive} = true
  ORDER BY ${userProjects.createdAt} ASC LIMIT 1
)`;

/**
 * One report by its track token. No user scoping BY DESIGN: the token IS the
 * authorization, exactly like a password-reset link, which is what lets a
 * reporter with no account follow their own report.
 *
 * That is also why the token has to be the whole `where`. Adding a convenience
 * fallback here (by id, by email) would turn a capability into a guess.
 */
export async function getFeedbackByTrackToken(token: string): Promise<SentFeedbackItem | null> {
  const [row] = await db
    .select({
      ...sentColumns(),
      hasScreenshots: hasScreenshotsSql.as("has_screenshots"),
      projectName: entities.name,
      liveUrl: projectLiveUrlSql.as("live_url"),
    })
    .from(siteFeedback)
    .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
    .where(eq(siteFeedback.trackToken, token))
    .limit(1);
  return row ?? null;
}

/**
 * Bind one report to the account now holding its track link.
 *
 * Only ever fills an EMPTY submitterUserId. A report already bound to someone
 * is not re-pointed by whoever opens the link next — a forwarded email would
 * otherwise silently move a report out of the reporter's own Sent list.
 * Returns whether this call did the binding.
 */
export async function claimFeedbackByTrackToken(token: string, userId: string): Promise<boolean> {
  const [claimed] = await db
    .update(siteFeedback)
    .set({ submitterUserId: userId })
    .where(and(eq(siteFeedback.trackToken, token), isNull(siteFeedback.submitterUserId)))
    .returning({ id: siteFeedback.id });
  return !!claimed;
}

/**
 * Bind every unclaimed report filed from `email` to this account.
 *
 * Called when an address is PROVEN to belong to the account — registration
 * that verified it, or the verify-email link. Never on a bare sign-in with an
 * unverified address: `submitter_email` comes from a public, unauthenticated
 * widget post, so anyone can file a report claiming any address, and claiming
 * on an unverified match would hand them whatever else that address filed.
 */
export async function claimFeedbackByEmail(email: string, userId: string): Promise<number> {
  const claimed = await db
    .update(siteFeedback)
    .set({ submitterUserId: userId })
    .where(
      and(
        eq(siteFeedback.submitterEmail, email.toLowerCase()),
        isNull(siteFeedback.submitterUserId),
      ),
    )
    .returning({ id: siteFeedback.id });
  return claimed.length;
}

/**
 * Reports this account SENT, newest first.
 *
 * Matches on the bound account only. The email half of the claim rule is
 * applied by claimFeedbackByEmail at verification time rather than re-tested
 * on every read, so a row appears here because something proved it belongs to
 * this account — not because an address on it happens to look familiar today.
 */
export async function listFeedbackSentByUser(
  userId: string,
  limit = 200,
): Promise<SentFeedbackItem[]> {
  return db
    .select({
      ...sentColumns(),
      hasScreenshots: hasScreenshotsSql.as("has_screenshots"),
      projectName: entities.name,
      liveUrl: projectLiveUrlSql.as("live_url"),
    })
    .from(siteFeedback)
    .innerJoin(entities, eq(siteFeedback.projectId, entities.id))
    .where(eq(siteFeedback.submitterUserId, userId))
    .orderBy(desc(siteFeedback.createdAt))
    .limit(limit);
}
