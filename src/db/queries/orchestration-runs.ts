import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orchestrationRuns,
  type NewOrchestrationRun,
  type OrchestrationOutcome,
} from "@/db/schema/orchestration-runs";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";

export const STALE_RUN_MINUTES = 60;

export async function createOrchestrationRun(run: NewOrchestrationRun) {
  const [created] = await db.insert(orchestrationRuns).values(run).returning();
  return created;
}

// userId is optional: API callers should pass it for isolation;
// background worker callers can omit it since runId is already unique.
export async function updateOrchestrationRun(
  id: string,
  patch: Partial<NewOrchestrationRun>,
  userId?: string,
) {
  const condition = userId
    ? and(eq(orchestrationRuns.id, id), eq(orchestrationRuns.userId, userId))
    : eq(orchestrationRuns.id, id);

  const [updated] = await db
    .update(orchestrationRuns)
    .set(patch)
    .where(condition)
    .returning();

  return updated;
}

export async function getOrchestrationRunById(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(orchestrationRuns)
    .where(and(eq(orchestrationRuns.id, id), eq(orchestrationRuns.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function cleanupStaleOrchestrationRuns(userId?: string) {
  // Did this run's project produce a handoff AFTER the run started? project_states
  // holds the box-pushed session state; a ready_at / session_updated_at newer
  // than started_at means the agent actually worked — the close just didn't fire.
  // Such a run is `partial` (progress), NOT a `timeout` failure. Only a run with
  // no evidence of work is a real timeout. (2026-07-11: reaping working agents as
  // timeout was inflating the fleet-pulse "Stalled" — truthseeker generated at
  // 05:00:43 yet its run was stamped timeout at 05:00:02.)
  const wroteAfterStart = sql`EXISTS (
    SELECT 1 FROM project_states ps
    WHERE ps.user_id = ${orchestrationRuns.userId}
      AND lower(ps.project_key) = lower(${orchestrationRuns.projectKey})
      AND GREATEST(ps.ready_at, ps.session_updated_at) > ${orchestrationRuns.startedAt}
  )`;
  // Alive and recently active = a long task, not a dead run. Don't reap it; it
  // closes from its own handoff, or a later tick reaps it once it goes quiet.
  const liveNow = sql`EXISTS (
    SELECT 1 FROM project_states ps
    WHERE ps.user_id = ${orchestrationRuns.userId}
      AND lower(ps.project_key) = lower(${orchestrationRuns.projectKey})
      AND ps.agent_running = true
      AND ps.session_updated_at > NOW() - INTERVAL '20 minutes'
  )`;

  const staleWhere = and(
    // Both un-terminal states: "running" (runner picked it up) and "waiting"
    // (opened but never closed). The local-runtime path opens runs as
    // "waiting" and closes them from the session handoff; if the agent never
    // writes a ready handoff (tab closed, process killed), the run would
    // otherwise linger open forever — reap it like a dead runner.
    inArray(orchestrationRuns.state, ["waiting", "running"]),
    lt(orchestrationRuns.startedAt, new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000)),
    sql`NOT ${liveNow}`,
  );
  const reaped = await db
    .update(orchestrationRuns)
    .set({
      // done (worked) vs error (dead). A reaped run must record a terminal
      // OUTCOME (not null) so it can't silently vanish from the streak/stats.
      state: sql`CASE WHEN ${wroteAfterStart} THEN 'done' ELSE 'error' END`,
      outcome: sql`CASE WHEN ${wroteAfterStart} THEN 'partial' ELSE 'timeout' END`,
      // Truthful duration: the run ended at the timeout threshold, not when the
      // janitor noticed. (Stamping reap-time once produced "51h" durations.)
      finishedAt: sql`${orchestrationRuns.startedAt} + make_interval(mins => ${STALE_RUN_MINUTES})`,
      payload: sql`jsonb_set(COALESCE(payload, '{}'), '{error}', to_jsonb(
        CASE WHEN ${wroteAfterStart}
          THEN 'Reaper closed an open run whose agent had already written a handoff — counted as partial, not a failure'
          ELSE 'Timed out — run exceeded maximum duration and was cleaned up'
        END::text))`,
    })
    // No userId (the cron janitor) → reap across ALL users; the page-load call
    // sites keep passing their own userId for scope hygiene.
    .where(userId ? and(eq(orchestrationRuns.userId, userId), staleWhere) : staleWhere)
    .returning({ id: orchestrationRuns.id, projectKey: orchestrationRuns.projectKey, userId: orchestrationRuns.userId, outcome: orchestrationRuns.outcome });
  return reaped;
}

/**
 * All currently-open runs (no terminal state yet), oldest first — the work-list
 * for the cron close-sweep. minAgeMinutes skips runs that just started so the
 * sweep never races a dispatch that hasn't produced a handoff yet.
 */
export async function listOpenRuns(minAgeMinutes = 5) {
  return db
    .select({
      id: orchestrationRuns.id,
      userId: orchestrationRuns.userId,
      adapter: orchestrationRuns.adapter,
      projectKey: orchestrationRuns.projectKey,
      startedAt: orchestrationRuns.startedAt,
      finishedAt: orchestrationRuns.finishedAt,
      // Parallel runs (phase 2 worktree-per-agent) carry their derived tab in
      // payload.sessionTab — the close path matches pushed handoffs on it.
      payload: orchestrationRuns.payload,
    })
    .from(orchestrationRuns)
    .where(
      and(
        inArray(orchestrationRuns.state, ["waiting", "running"]),
        isNull(orchestrationRuns.finishedAt),
        lt(orchestrationRuns.startedAt, new Date(Date.now() - minAgeMinutes * 60 * 1000)),
      ),
    )
    .orderBy(orchestrationRuns.startedAt);
}

/**
 * Is this project busy for this user — i.e. is another agent's run AHEAD of
 * ours? The SSOT "busy" predicate for per-project dispatch serialization.
 *
 * Gates on run AGE, not mere existence: busy iff an OPEN run (finishedAt IS
 * NULL, within the stale-reap window) for this project is OLDER than our own
 * run `excludeRunId`. This is what makes serialization FIFO WITHOUT deadlock —
 * every queued dispatch opens its own run, so "any other open run = busy" would
 * have queued dispatches block each other forever; "oldest open run wins" lets
 * them drain in creation order. The (started_at, id) tuple compare also
 * self-excludes (a run is never older than itself) and breaks the sub-µs
 * started_at tie deterministically. The stale-window floor mirrors
 * cleanupStaleOrchestrationRuns so a crashed run can't wedge a project past
 * STALE_RUN_MINUTES. With no excludeRunId, ANY open run counts as busy.
 */
export async function isProjectBusy(
  userId: string,
  projectKey: string,
  opts: { excludeRunId?: string } = {},
): Promise<boolean> {
  const conds = [
    eq(orchestrationRuns.userId, userId),
    eq(orchestrationRuns.projectKey, projectKey),
    isNull(orchestrationRuns.finishedAt),
    sql`${orchestrationRuns.startedAt} > NOW() - INTERVAL '1 minute' * ${STALE_RUN_MINUTES}`,
  ];
  if (opts.excludeRunId) {
    // Only runs strictly older than ours (by started_at, then id) block us.
    conds.push(sql`(${orchestrationRuns.startedAt}, ${orchestrationRuns.id}) < (SELECT own.started_at, own.id FROM orchestration_runs own WHERE own.id = ${opts.excludeRunId})`);
  }
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(orchestrationRuns)
    .where(and(...conds))
    .limit(1);
  return !!row;
}

export async function getLatestRunsByProjectPaths(userId: string, projectPaths: string[]) {
  if (projectPaths.length === 0) return new Map<string, typeof orchestrationRuns.$inferSelect>();

  const rows = await db
    .select()
    .from(orchestrationRuns)
    .where(
      and(
        eq(orchestrationRuns.userId, userId),
        inArray(orchestrationRuns.projectPath, projectPaths),
      ),
    )
    .orderBy(desc(orchestrationRuns.startedAt));

  const latest = new Map<string, typeof orchestrationRuns.$inferSelect>();
  for (const row of rows) {
    if (!latest.has(row.projectPath)) {
      latest.set(row.projectPath, row);
    }
  }
  return latest;
}

export async function getProjectOrchestrationRuns(userId: string, projectId: string, limit = 20) {
  return db
    .select()
    .from(orchestrationRuns)
    .where(and(eq(orchestrationRuns.userId, userId), eq(orchestrationRuns.projectId, projectId)))
    .orderBy(desc(orchestrationRuns.startedAt))
    .limit(limit);
}

export type RecentOutcome = {
  outcome: OrchestrationOutcome;
  intent: OrchestrationTaskIntentId;
  finishedAt: Date;
};

/**
 * Batch variant of getRecentOutcomes — one round-trip for all projects on the
 * control panel instead of N queries. Used by /api/control to populate
 * ProjectState.recentOutcomes.
 */
export async function getRecentOutcomesByProjectKeys(
  userId: string,
  projectKeys: string[],
  perKeyLimit = 5,
): Promise<Map<string, OrchestrationOutcome[]>> {
  const result = new Map<string, OrchestrationOutcome[]>();
  if (projectKeys.length === 0) return result;

  const rows = await db
    .select({
      projectKey: orchestrationRuns.projectKey,
      outcome: orchestrationRuns.outcome,
      finishedAt: orchestrationRuns.finishedAt,
    })
    .from(orchestrationRuns)
    .where(and(
      eq(orchestrationRuns.userId, userId),
      inArray(orchestrationRuns.projectKey, projectKeys),
      isNotNull(orchestrationRuns.outcome),
      isNotNull(orchestrationRuns.finishedAt),
      // Same recency window as getRecentOutcomes — stale failures are history,
      // not a live streak on every project card.
      gt(orchestrationRuns.finishedAt, new Date(Date.now() - RECENT_OUTCOMES_WINDOW_MS)),
    ))
    .orderBy(desc(orchestrationRuns.finishedAt));

  for (const r of rows) {
    if (!r.outcome) continue;
    const arr = result.get(r.projectKey) ?? [];
    if (arr.length < perKeyLimit) arr.push(r.outcome);
    result.set(r.projectKey, arr);
  }
  return result;
}

/**
 * "Recent" means RECENT: outcomes older than this are history, not current
 * state. Without this window, the July credential outage kept painting ✗
 * streaks on Control cards and the dispatch reasoner for weeks after the
 * failures stopped being news. SSOT here so every consumer (streak chips,
 * dispatch gates, nudge brake, dossier) ages out together.
 */
export const RECENT_OUTCOMES_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Returns the most recent finished orchestration runs for a project, newest
 * first — bounded to RECENT_OUTCOMES_WINDOW_MS.
 * Backed by idx_orchestration_runs_recent_outcomes (partial index, finishedAt IS NOT NULL).
 * Used by the dispatch reasoner and ProjectCard streak chip.
 */
export async function getRecentOutcomes(
  userId: string,
  projectKey: string,
  opts: { intent?: OrchestrationTaskIntentId; limit?: number } = {},
): Promise<RecentOutcome[]> {
  const limit = opts.limit ?? 5;
  const conditions = [
    eq(orchestrationRuns.userId, userId),
    eq(orchestrationRuns.projectKey, projectKey),
    isNotNull(orchestrationRuns.outcome),
    isNotNull(orchestrationRuns.finishedAt),
    gt(orchestrationRuns.finishedAt, new Date(Date.now() - RECENT_OUTCOMES_WINDOW_MS)),
  ];
  if (opts.intent) conditions.push(eq(orchestrationRuns.intent, opts.intent));

  const rows = await db
    .select({
      outcome: orchestrationRuns.outcome,
      intent: orchestrationRuns.intent,
      finishedAt: orchestrationRuns.finishedAt,
    })
    .from(orchestrationRuns)
    .where(and(...conditions))
    .orderBy(desc(orchestrationRuns.finishedAt))
    .limit(limit);

  return rows
    .filter((r): r is { outcome: OrchestrationOutcome; intent: OrchestrationTaskIntentId; finishedAt: Date } =>
      r.outcome !== null && r.finishedAt !== null)
    .map((r) => ({ outcome: r.outcome, intent: r.intent, finishedAt: r.finishedAt }));
}
