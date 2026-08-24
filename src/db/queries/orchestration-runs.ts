import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { ORCH_STATE } from "@/lib/orchestration/contract";
import {
  ORCHESTRATION_OUTCOME,
  orchestrationRuns,
  type NewOrchestrationRun,
  type OrchestrationOutcome,
} from "@/db/schema/orchestration-runs";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { resolveFeedbackForRun } from "@/lib/feedback/close-loop";
import { promoteRunClose } from "@/lib/integrations/orangecat-publish";
import { isFailingOutcome } from "@/lib/events";
import { advanceEscalation, resolveEscalation } from "./run-escalations";
import { notifyRunClosed } from "@/lib/orchestration/notify-close";
import { correctTimeoutReapsWithRepoEvidence } from "@/lib/orchestration/reap-evidence";
import { emitRunEvent } from "./run-events";
import { RUNNER_OFFLINE_THRESHOLD_MS } from "@/lib/constants/runner";

export const STALE_RUN_MINUTES = 60;

/**
 * Absolute ceiling on how long a run may stay open, even with a live agent
 * heartbeat. Real autopilot turns do run for hours (datacat worked 04:00→11:00
 * on 2026-08-02), so the ceiling has to clear that comfortably; past it, a
 * "still running" claim is far more likely a wedged process than progress.
 */
export const MAX_RUN_HOURS = 12;

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

  // Every success-producing close path (runner finish route, gate-and-close)
  // funnels through here — the reaper bypasses it but never stamps success, so
  // skipping feedback resolution there is correct. (It does NOT get to skip the
  // notification; the reaper fires that itself. See the loop in
  // cleanupStaleOrchestrationRuns.)
  // Fire-and-forget: closing the feedback loop must not slow or fail the close.
  if (updated && patch.finishedAt && patch.outcome === ORCHESTRATION_OUTCOME.SUCCESS) {
    void resolveFeedbackForRun(updated.id);
    // Run→wall loop: successful agent work surfaces as OrangeCat activity for
    // OC-published projects. Idempotent (external_id = run id) and re-sent by
    // the daily promote backfill, so a dropped emit here is never lost.
    void promoteRunClose(updated);
    // A success closes the project's open escalation ladder, if any.
    void resolveEscalation(updated.userId, updated.projectKey, "success");
  }

  // Escalation ladder: every failing close advances the project one rung
  // (retry → patch → replan → human). isFailingOutcome is the same predicate
  // the failure brake uses, so ladder rungs and brake streak count the same
  // events. Fire-and-forget — bookkeeping never fails a close.
  if (updated && patch.finishedAt && isFailingOutcome(patch.outcome)) {
    void advanceEscalation({
      userId: updated.userId,
      projectKey: updated.projectKey,
      runId: updated.id,
      outcome: patch.outcome ?? "error",
      error: updated.payload?.error ?? null,
    });
  }

  // Chat-originated runs push their outcome back to chat (opt-in via
  // payload.notifyOnClose). Both branches above are outcome-specific; this
  // fires on ANY close so a chat dispatch never ends in silence.
  if (updated && patch.finishedAt) {
    void notifyRunClosed(updated);
  }

  return updated;
}

/**
 * Delivery stamp: the runner ack'd this run's prompt as actually typed into the
 * session. Recorded on payload (NEVER on startedAt — (started_at, id) is the
 * serialization order in the claim gate and isProjectBusy; re-stamping it would
 * flip blocking direction mid-flight). The close paths use deliveredAt as the
 * handoff-freshness floor, so a stale ready re-push from before delivery can
 * never close this run.
 */
export async function stampRunDelivered(runId: string, userId: string): Promise<void> {
  await db
    .update(orchestrationRuns)
    .set({
      payload: sql`jsonb_set(COALESCE(payload, '{}'), '{deliveredAt}', ${JSON.stringify(new Date().toISOString())}::jsonb)`,
    })
    .where(and(
      eq(orchestrationRuns.id, runId),
      eq(orchestrationRuns.userId, userId),
      isNull(orchestrationRuns.finishedAt),
    ));
}

/**
 * The runner nack'd the dispatch — the prompt never landed, so the run can
 * never produce a handoff. Close it as error IMMEDIATELY: leaving it open would
 * head-of-line block the project's queued dispatches for up to
 * STALE_RUN_MINUTES. Outcome ≠ success, so close-the-loop never fires off it.
 */
export async function closeRunUndelivered(runId: string, userId: string, reason: string): Promise<void> {
  const [closed] = await db
    .update(orchestrationRuns)
    .set({
      state: ORCH_STATE.ERROR,
      outcome: ORCHESTRATION_OUTCOME.ERROR,
      finishedAt: new Date(),
      payload: sql`jsonb_set(COALESCE(payload, '{}'), '{error}', to_jsonb(${`Dispatch failed before the prompt reached the agent: ${reason}`}::text))`,
    })
    .where(and(
      eq(orchestrationRuns.id, runId),
      eq(orchestrationRuns.userId, userId),
      isNull(orchestrationRuns.finishedAt),
    ))
    .returning();
  if (closed) {
    void emitRunEvent(runId, userId, "closed", { outcome: ORCHESTRATION_OUTCOME.ERROR, by: "runner-nack", reason });
    // This path bypasses updateOrchestrationRun, so it must emit its own
    // chat notification — a chat dispatch that never reached a runner is
    // exactly the close the operator most needs to hear about.
    void notifyRunClosed(closed);
  }
}

/**
 * Recent successful runs for one project — feeds the OC promote backfill so a
 * dropped run→wall emit self-heals (external ids are deterministic, OC
 * reconciles on them). Uses idx_orchestration_runs_recent_outcomes.
 */
export async function getRecentSuccessfulRuns(
  userId: string,
  projectKey: string,
  since: Date,
  limit = 10,
) {
  return db
    .select()
    .from(orchestrationRuns)
    .where(
      and(
        eq(orchestrationRuns.userId, userId),
        eq(orchestrationRuns.projectKey, projectKey),
        eq(orchestrationRuns.outcome, ORCHESTRATION_OUTCOME.SUCCESS),
        isNotNull(orchestrationRuns.finishedAt),
        gt(orchestrationRuns.finishedAt, since),
      ),
    )
    .orderBy(desc(orchestrationRuns.finishedAt))
    .limit(limit);
}

export async function getOrchestrationRunById(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(orchestrationRuns)
    .where(and(eq(orchestrationRuns.id, id), eq(orchestrationRuns.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Batch lookup for feedback work-phase enrichment. */
export async function getOrchestrationRunsByIds(userId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, typeof orchestrationRuns.$inferSelect>();
  const rows = await db
    .select()
    .from(orchestrationRuns)
    .where(and(eq(orchestrationRuns.userId, userId), inArray(orchestrationRuns.id, ids)));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function cleanupStaleOrchestrationRuns(userId?: string) {
  // Did this run's project produce a handoff AFTER the run started? project_states
  // holds the box-pushed session state; a ready_at / session_updated_at newer
  // than started_at means the agent actually worked — the close just didn't fire.
  // Such a run is `partial` (progress), NOT a `timeout` failure. Only a run with
  // no evidence of work is a real timeout. (2026-07-11: reaping working agents as
  // timeout was inflating the fleet-pulse "Stalled" — truthseeker generated at
  // 05:00:43 yet its run was stamped timeout at 05:00:02.)
  // Same freshness floor the CLOSER uses (runEffectiveStartMs): `deliveredAt`
  // — the runner's ack of the prompt — beats `started_at`, which is merely when
  // the row was created and can precede delivery by a minute or more. When the
  // two disagreed, a handoff landing in that window counted as work HERE
  // (→ 'partial') while closeRunFromSession rightly judged it stale and left the
  // run open — so the run was reaped with a partial verdict and a NULL summary,
  // recording a failure whose reason nobody could read. One floor, both paths.
  const effectiveStart = sql`COALESCE((${orchestrationRuns.payload}->>'deliveredAt')::timestamptz, ${orchestrationRuns.startedAt})`;
  const wroteAfterStart = sql`EXISTS (
    SELECT 1 FROM project_states ps
    WHERE ps.user_id = ${orchestrationRuns.userId}
      AND lower(ps.project_key) = lower(${orchestrationRuns.projectKey})
      AND GREATEST(ps.ready_at, ps.session_updated_at) > ${effectiveStart}
  )`;
  // Alive = a long task, not a dead run. Don't reap it; it closes from its own
  // handoff, or a later tick reaps it once it goes quiet.
  //
  // Liveness must come from the runner's HEARTBEAT (`runtime_observed_at`), not
  // from handoff freshness (`session_updated_at`): a handoff is written at the
  // END of a turn, so a genuinely working agent looks dead the whole time it is
  // working. That inversion is why datacat's run was stamped `timeout` at 05:00
  // on 2026-08-02 while its agent went on writing until 11:01 — the run record
  // called a healthy agent dead. `agent_running` is the runner's claim that a
  // process exists; the heartbeat is what makes that claim still trustworthy.
  const liveNow = sql`EXISTS (
    SELECT 1 FROM project_states ps
    WHERE ps.user_id = ${orchestrationRuns.userId}
      AND lower(ps.project_key) = lower(${orchestrationRuns.projectKey})
      AND ps.agent_running = true
      AND ps.runtime_observed_at > NOW() - ${sql.raw(`INTERVAL '${Math.round(RUNNER_OFFLINE_THRESHOLD_MS / 1000)} seconds'`)}
  )`;

  // `agent_running` is "a process exists", not "it is working on MY prompt" —
  // and an idle agent sitting at a ready prompt has a process too. So liveness
  // alone let a run nobody had started be sheltered for the full MAX_RUN_HOURS.
  //
  // The runner already knows the difference and says so: after typing a prompt
  // in it re-checks the session, and when the agent never reacted it acks
  // `verified: false` ("the keystrokes landed but the agent isn't generating").
  // That is a positive statement about THIS run, so it outranks a project-wide
  // heartbeat. Only an explicit false counts — a null verdict is "no claim
  // made" and must not change behaviour.
  //
  // Deliberately narrow: a genuinely working agent still writes no handoff
  // until its turn ends, so liveness must keep sheltering it (datacat wrote
  // until 11:01 after being stamped `timeout` at 05:00). This disqualifies only
  // runs the runner itself reported as never having started.
  const runNeverStarted = sql`EXISTS (
    SELECT 1 FROM pending_commands pc
    WHERE pc.payload->>'runId' = ${orchestrationRuns.id}::text
      AND pc.executed_at IS NOT NULL
      AND pc.result->>'verified' = 'false'
  )`;

  const staleWhere = and(
    // Both un-terminal states: "running" (runner picked it up) and "waiting"
    // (opened but never closed). The local-runtime path opens runs as
    // "waiting" and closes them from the session handoff; if the agent never
    // writes a ready handoff (tab closed, process killed), the run would
    // otherwise linger open forever — reap it like a dead runner.
    inArray(orchestrationRuns.state, [ORCH_STATE.WAITING, ORCH_STATE.RUNNING]),
    lt(orchestrationRuns.startedAt, new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000)),
    // Live agents are spared — but only up to a hard ceiling, so a wedged
    // process that keeps its heartbeat alive can't hold a run open forever,
    // and never when the runner has already said this run never started.
    sql`(NOT ${liveNow} OR ${runNeverStarted} OR ${orchestrationRuns.startedAt} < NOW() - ${sql.raw(`INTERVAL '${MAX_RUN_HOURS} hours'`)})`,
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
    // Full rows: notifyRunClosed below needs payload (notifyOnClose, error) and
    // finishedAt, not just the reap bookkeeping columns.
    .returning();

  // Honesty backstop: a `timeout` verdict means "no evidence of work", but the
  // handoff check above only sees project_states — a box agent that pushed a
  // branch/PR and died before writing a handoff looks identical to a dead run.
  // Check the repo itself and correct such verdicts to `partial`. Fire-and-
  // forget: GitHub lookups must never slow a reap (page-load call sites).
  if (reaped.some((r) => r.outcome === ORCHESTRATION_OUTCOME.TIMEOUT)) {
    void correctTimeoutReapsWithRepoEvidence(reaped);
  }
  // Reaped closes bypass updateOrchestrationRun, so advance ladders here.
  // Only genuinely failing outcomes count (timeout yes, partial no — same
  // isFailingOutcome predicate as the funnel and the brake). Note the evidence
  // corrector above may later flip a timeout→partial; that correction doesn't
  // rewind the ladder — a success resolves it, which is the honest reset.
  for (const r of reaped) {
    if (isFailingOutcome(r.outcome)) {
      void advanceEscalation({
        userId: r.userId,
        projectKey: r.projectKey,
        runId: r.id,
        outcome: r.outcome ?? "timeout",
        error: "Timed out — run exceeded maximum duration and was cleaned up",
      });
    }
    // ...and announce them, for the same reason. The funnel notifies on ANY
    // close (updateOrchestrationRun), so a run that SUCCEEDS told the operator
    // while a run that DIED said nothing — failure was the one outcome the
    // product kept to itself. That asymmetry is how visitor-feedback fixes sat
    // "in progress" for weeks after their runs had timed out: the inbox looked
    // busy because the only thing that could have contradicted it was silent.
    //
    // Self-gating, so this is not a new noise source: formatRunCloseMessage
    // returns null unless payload.notifyOnClose is set, which only
    // human-initiated dispatches carry — autopilot churn stays quiet.
    //
    // Deliberately NOT resolveFeedbackForRun: that helper resolves
    // unconditionally and the reaper never stamps success, so calling it here
    // would mark feedback "shipped" because its fix run DIED.
    void notifyRunClosed(r);
  }
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
        inArray(orchestrationRuns.state, [ORCH_STATE.WAITING, ORCH_STATE.RUNNING]),
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
