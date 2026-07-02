import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
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

export async function cleanupStaleOrchestrationRuns(userId?: string) {
  const staleWhere = and(
    // Both un-terminal states: "running" (runner picked it up) and "waiting"
    // (opened but never closed). The local-runtime path opens runs as
    // "waiting" and closes them from the session handoff; if the agent never
    // writes a ready handoff (tab closed, process killed), the run would
    // otherwise linger open forever — reap it as a timeout like a dead runner.
    inArray(orchestrationRuns.state, ["waiting", "running"]),
    lt(orchestrationRuns.startedAt, new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000)),
  );
  const reaped = await db
    .update(orchestrationRuns)
    .set({
      state: "error",
      // Record a terminal OUTCOME, not just state=error. Without this, a reaped
      // run stays outcome=null and is invisible to the outcome streak / success
      // stats (which read `outcome`), so a runner that dies mid-task silently
      // vanishes from the autonomy feedback loop instead of counting as a
      // timeout — the exact truthful-state gap the loop must reflect.
      outcome: "timeout",
      // Truthful duration: the run DIED at the timeout threshold, not at the
      // moment a janitor happened to notice. Stamping reap-time here once
      // produced "51h" durations in Activity for runs that timed out after
      // 60 minutes — the reaper only ran on Control page loads and nobody
      // opened Control for two days.
      finishedAt: sql`${orchestrationRuns.startedAt} + make_interval(mins => ${STALE_RUN_MINUTES})`,
      payload: sql`jsonb_set(COALESCE(payload, '{}'), '{error}', '"Timed out — run exceeded maximum duration and was cleaned up"')`,
    })
    // No userId (the cron janitor) → reap across ALL users; the page-load call
    // sites keep passing their own userId for scope hygiene.
    .where(userId ? and(eq(orchestrationRuns.userId, userId), staleWhere) : staleWhere)
    .returning({ id: orchestrationRuns.id, projectKey: orchestrationRuns.projectKey });
  return reaped;
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
 * Returns the most recent finished orchestration runs for a project, newest first.
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
