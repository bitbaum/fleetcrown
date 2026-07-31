import { db } from "@/db";
import { pendingCommands, type NewPendingCommand, type InjectPayload, type DispatchPayload, type SwitchAgentPayload, type AutoContinuePayload, type TabPayload, type LaunchAgentPayload, type RunnerChannel } from "@/db/schema/pending-commands";
import { eq, isNull, isNotNull, and, inArray, notInArray, desc, sql } from "drizzle-orm";
import type { FailedCommand } from "@/lib/control-types";
import { STALE_RUN_MINUTES } from "./orchestration-runs";

export async function getCommandById(id: string) {
  const [row] = await db.select().from(pendingCommands).where(eq(pendingCommands.id, id)).limit(1);
  return row ?? null;
}

/**
 * Runner EXECUTION health — distinct from the push/sync heartbeat. A Fleet
 * Runner can keep pushing snapshots ("Connected · sync just now") while its
 * command-execution loop is hung, so every dispatch silently queues forever and
 * agents never move. This detects exactly that: commands accepted but not
 * executed past a grace window (ignoring ancient leftovers). Surfaced in the
 * fleet header so a stalled runner is loud instead of masquerading as healthy.
 * (Dogfood 2026-06-19: a hung runner wasted hours while showing "Connected".)
 */
export async function getRunnerExecutionStall(userId: string, graceSeconds = 120) {
  const [row] = await db
    .select({
      stalledCount: sql<number>`count(*)::int`,
      oldestSeconds: sql<number>`coalesce(extract(epoch from (now() - min(created_at)))::int, 0)`,
    })
    .from(pendingCommands)
    .where(and(
      eq(pendingCommands.userId, userId),
      isNull(pendingCommands.executedAt),
      sql`created_at < now() - interval '1 second' * ${graceSeconds}`,
      sql`created_at > now() - interval '2 hours'`,
    ));
  const stalledCount = row?.stalledCount ?? 0;
  return { stalled: stalledCount > 0, stalledCount, oldestSeconds: row?.oldestSeconds ?? 0 };
}

export async function enqueuePendingCommand(
  command: Omit<NewPendingCommand, "id" | "createdAt">,
): Promise<string> {
  const [row] = await db.insert(pendingCommands).values(command).returning({ id: pendingCommands.id });
  return row.id;
}

export async function enqueueInjectCommand(
  userId: string,
  payload: InjectPayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "inject", payload });
}

export async function enqueueDispatchCommand(
  userId: string,
  payload: DispatchPayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "dispatch", payload });
}

/** True when an unexecuted command already targets this project (inject or dispatch). */
export async function hasOpenPendingForProject(userId: string, projectKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pendingCommands.id })
    .from(pendingCommands)
    .where(
      and(
        eq(pendingCommands.userId, userId),
        isNull(pendingCommands.executedAt),
        sql`(
          ${pendingCommands.payload}->>'projectKey' = ${projectKey}
          OR ${pendingCommands.payload}->>'tab' = ${projectKey}
        )`,
      ),
    )
    .limit(1);
  return !!row;
}

/** True when this run's dispatch/inject command is still queued (gate-held or
 *  runner offline) — the prompt was never delivered, so no session handoff can
 *  be this run's work. The close sweep uses this to skip such runs. */
export async function hasUndeliveredCommandForRun(userId: string, runId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pendingCommands.id })
    .from(pendingCommands)
    .where(and(
      eq(pendingCommands.userId, userId),
      isNull(pendingCommands.executedAt),
      sql`${pendingCommands.payload}->>'runId' = ${runId}`,
    ))
    .limit(1);
  return !!row;
}

/** Hosted runner (Phase 0): a read-only analysis/plan/review of a project's
 *  repo, executed on hosted compute rather than the operator's machine. Its own
 *  command type so it never collides with the local-runner dispatch/inject path. */
export type HostedAnalyzePayload = { projectKey: string; gitUrl: string; task: string };
export async function enqueueHostedAnalyzeCommand(
  userId: string,
  payload: HostedAnalyzePayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "hosted_analyze", payload });
}

/** Hosted runner Phase 1: a WRITE-class task dispatched to a coding agent
 *  (Hermes) on hosted compute — clone, run the agent in its own sandbox, return
 *  the work. Own type so it's distinct from the read-only hosted_analyze and
 *  from the local-runner dispatch path. `model` overrides HERMES_INFERENCE_MODEL. */
export type HostedDispatchPayload = { projectKey: string; gitUrl: string; task: string; model?: string };
export async function enqueueHostedDispatchCommand(
  userId: string,
  payload: HostedDispatchPayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "hosted_dispatch", payload });
}

export async function enqueueSwitchAgentCommand(
  userId: string,
  payload: SwitchAgentPayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "switch_agent", payload });
}

export async function enqueueAutoContinueCommand(
  userId: string,
  payload: AutoContinuePayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "auto_continue", payload });
}

export async function enqueueTabCommand(userId: string, type: "focus_tab" | "close_tab", payload: TabPayload): Promise<string> {
  return enqueuePendingCommand({ userId, type, payload });
}

export async function enqueueLaunchAgentCommand(userId: string, payload: LaunchAgentPayload): Promise<string> {
  return enqueuePendingCommand({ userId, type: "launch_agent", payload });
}

/** Live terminal: tell the runner to start/stop streaming a tab's screen.
 *  See docs/architecture/embedded-terminal.md. */
export async function enqueuePeekCommand(userId: string, type: "peek_start" | "peek_stop", payload: TabPayload): Promise<string> {
  return enqueuePendingCommand({ userId, type, payload });
}

/** Re-enqueues a failed (or delivered-but-unverified) command verbatim.
 *  Returns the new command id, or null when the source command doesn't
 *  exist, belongs to another user, or never actually failed. */
export async function retryFailedCommand(userId: string, id: string): Promise<string | null> {
  const [row] = await db
    .select({ type: pendingCommands.type, payload: pendingCommands.payload })
    .from(pendingCommands)
    .where(and(
      eq(pendingCommands.id, id),
      eq(pendingCommands.userId, userId),
      isNotNull(pendingCommands.executedAt),
      sql`((${pendingCommands.result}->>'ok') = 'false' OR (${pendingCommands.result}->>'verified') = 'false')`,
    ))
    .limit(1);
  if (!row) return null;
  return enqueuePendingCommand({ userId, type: row.type, payload: row.payload });
}

// Atomically claims the next unclaimed command for one or more already
// authorized user IDs. API bearer routes must pass only the token owner's ID.
// FOR UPDATE SKIP LOCKED prevents two concurrent pollers from claiming the same row.
//
// Dispatch legitimately holds a claim while it launches an agent, verifies the
// prompt was submitted, and runs the delayed auth canary (normally 20-35s).
// A 10s lease reclaimed healthy work mid-handler, making Loki regress from
// "working" back to "queued" and handing the row to a second poller. Runner
// type filters now prevent the old incompatible-runner orphan case, so retain a
// 90s crash-recovery lease without duplicating live dispatches.
const STALE_CLAIM_SECONDS = 90;

// Hosted runs (Hermes clone→edit→PR) legitimately hold a claim for MINUTES —
// run-hermes has a 15-min timeout. The 90s local-dispatch lease would reclaim a
// healthy in-flight Hermes run, and a second drainer tick then re-runs it →
// duplicate branches/PRs (observed 2026-07-22). Give hosted command types a
// lease longer than the run timeout so only a genuinely dead run is reclaimed.
const HOSTED_STALE_CLAIM_SECONDS = 20 * 60;
const HOSTED_COMMAND_TYPES = ["hosted_dispatch", "hosted_analyze"] as const;

// Commands queued while the runner was offline go stale fast: executing a
// days-old "inject into tab X" / "launch agent in Y" against a Zellij that has
// since changed just fails noisily and clutters Control. Purge unclaimed,
// unexecuted commands older than this before claiming, so the runner never
// drains an outdated backlog on reconnect. Generous enough that a healthy
// runner (drains in seconds) never trips it.
const STALE_COMMAND_MAX_AGE_MINUTES = 20;

/** Delete the offline backlog: unclaimed + unexecuted commands older than the
 *  staleness cutoff. The original dispatch is still recorded in
 *  control_audit_events, so nothing auditable is lost. Returns the count. */
export async function purgeStalePendingCommands(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const userFilter = userIds.length === 1
    ? eq(pendingCommands.userId, userIds[0])
    : inArray(pendingCommands.userId, userIds);
  const deleted = await db
    .delete(pendingCommands)
    .where(and(
      userFilter,
      isNull(pendingCommands.claimedAt),
      isNull(pendingCommands.executedAt),
      sql`${pendingCommands.createdAt} < NOW() - INTERVAL '1 minute' * ${STALE_COMMAND_MAX_AGE_MINUTES}`,
      // A dispatch/inject held by the per-project serialization gate is NOT an
      // offline backlog — it is legitimately waiting for the older run to close
      // (up to STALE_RUN_MINUTES). Purging it at 20 min would silently drop the
      // work AND leave its own open run wedging the project. It becomes
      // purgeable again the moment its run closes or goes stale.
      sql`NOT (
        ${pendingCommands.type} IN ('dispatch','inject')
        AND ${pendingCommands.payload}->>'runId' IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM orchestration_runs own
          WHERE own.id = (${pendingCommands.payload}->>'runId')::uuid
            AND own.finished_at IS NULL
            AND own.started_at > NOW() - INTERVAL '1 minute' * ${STALE_RUN_MINUTES}
        )
      )`,
    ))
    .returning({ id: pendingCommands.id });
  return deleted.length;
}

/** Commands claimed but never finished (runner crash/restart) become claimable again. */
export async function reclaimStalePendingCommands(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const userFilter = userIds.length === 1
    ? eq(pendingCommands.userId, userIds[0])
    : inArray(pendingCommands.userId, userIds);
  // Type-aware lease in two typed batches (a CASE around the lease param leaves
  // it type-unknown → `interval * unknown` → 42883). Hosted (Hermes) runs get a
  // much longer grace so a healthy multi-minute run is never reclaimed mid-flight
  // and double-run; local dispatch keeps the short lease.
  const hostedTypes = [...HOSTED_COMMAND_TYPES];
  const reclaimBatch = (typeCond: ReturnType<typeof inArray>, seconds: number) =>
    db
      .update(pendingCommands)
      .set({ claimedAt: null })
      .where(and(
        userFilter,
        isNotNull(pendingCommands.claimedAt),
        isNull(pendingCommands.executedAt),
        typeCond,
        sql`${pendingCommands.claimedAt} < NOW() - INTERVAL '1 second' * ${seconds}`,
      ))
      .returning({ id: pendingCommands.id });
  const [hosted, local] = await Promise.all([
    reclaimBatch(inArray(pendingCommands.type, hostedTypes), HOSTED_STALE_CLAIM_SECONDS),
    reclaimBatch(notInArray(pendingCommands.type, hostedTypes), STALE_CLAIM_SECONDS),
  ]);
  return hosted.length + local.length;
}

export async function claimNextPendingCommand(userIds: string[], types?: string[], runnerChannel?: RunnerChannel) {
  if (userIds.length === 0) return null;
  await purgeStalePendingCommands(userIds);
  await reclaimStalePendingCommands(userIds);
  const userFilter = userIds.length === 1
    ? eq(pendingCommands.userId, userIds[0])
    : inArray(pendingCommands.userId, userIds);
  const cleanTypes = types?.map((type) => type.trim()).filter(Boolean) ?? [];
  const typeFilter = cleanTypes.length > 0 ? inArray(pendingCommands.type, cleanTypes) : undefined;
  const channelFilter = runnerChannel
    ? sql`(
        ${pendingCommands.payload}->>'channel' IS NULL
        OR ${pendingCommands.payload}->>'channel' = ${runnerChannel}
      )`
    : sql`${pendingCommands.payload}->>'channel' IS NULL`;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(pendingCommands)
      .where(and(
        userFilter,
        typeFilter,
        channelFilter,
        isNull(pendingCommands.claimedAt),
        // Per-project serialization (FIFO by run age): a dispatch/inject is
        // eligible only when its own run is the OLDEST open run for the project —
        // i.e. NO open run is older (by started_at, then id) than the run its
        // payload.runId points to. Gating on age (not mere existence) is what
        // avoids deadlock: every queued dispatch opens its own run, so "any other
        // open run = busy" would have them block each other; "oldest wins" drains
        // them in order. Commands with no projectKey/runId (focus_tab, peek,
        // lifecycle hard_stop/close_session — which open no run) are never blocked.
        // A busy project's rows are skipped so a different project's row is claimed
        // → cross-project parallelism intact. The check runs INSIDE the FOR UPDATE
        // SKIP LOCKED tx (correct under concurrent pollers); the started_at floor
        // mirrors cleanupStaleOrchestrationRuns so a crashed run can't wedge a
        // project past STALE_RUN_MINUTES.
        //
        // An older open run blocks until it CLOSES (finished_at), not until its
        // prompt is delivered — releasing on delivery merged two dispatches into
        // one agent session sharing one summary, and close-the-loop then resolved
        // feedback item B off item A's handoff. Exceptions, both directions:
        // derived-tab runs (payload.sessionTab, parallel worktree-per-agent) own
        // an isolated tab, so they neither block base-tab commands nor wait on them.
        sql`(
          ${pendingCommands.type} NOT IN ('dispatch','inject')
          OR ${pendingCommands.payload}->>'projectKey' IS NULL
          OR ${pendingCommands.payload}->>'runId' IS NULL
          OR EXISTS (
            SELECT 1 FROM orchestration_runs own
            WHERE own.id = (${pendingCommands.payload}->>'runId')::uuid
              AND own.payload->>'sessionTab' IS NOT NULL
          )
          OR NOT EXISTS (
	            SELECT 1 FROM orchestration_runs r
	            WHERE r.user_id = ${pendingCommands.userId}
	              AND r.project_key = ${pendingCommands.payload}->>'projectKey'
	              AND r.finished_at IS NULL
	              AND r.started_at > NOW() - INTERVAL '1 minute' * ${STALE_RUN_MINUTES}
	              AND r.payload->>'sessionTab' IS NULL
	              AND (r.started_at, r.id) < (
	                SELECT own.started_at, own.id FROM orchestration_runs own
	                WHERE own.id = (${pendingCommands.payload}->>'runId')::uuid
	              )
	          )
        )`,
      ))
      .orderBy(pendingCommands.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx
      .update(pendingCommands)
      .set({ claimedAt: new Date() })
      .where(eq(pendingCommands.id, row.id));
    return row;
  });
}

export async function markCommandExecuted(
  id: string,
  userId: string,
  result: { ok: boolean; text?: string; error?: string; warning?: string; verified?: boolean; workspaceId?: string },
): Promise<boolean> {
  const updated = await db
    .update(pendingCommands)
    // First ack wins: a double-claim's dedup re-ack ("already-done") once
    // clobbered the original rich result — including the "agent isn't
    // generating" warning — with a bare {ok:true}. COALESCE keeps the
    // earliest (richest) result; executedAt still updates so the claim clears.
    .set({
      executedAt: new Date(),
      result: sql`COALESCE(${pendingCommands.result}, ${JSON.stringify(result)}::jsonb)`,
    })
    .where(and(eq(pendingCommands.id, id), eq(pendingCommands.userId, userId)))
    .returning({ id: pendingCommands.id });
  return updated.length > 0;
}

/** Loop-guard stats for headless auto-reroute: how many switch_agent commands
 *  we've queued for this project (by tab) in the last 15 min, and whether one
 *  is still unclaimed. Windowed so a long-dead unclaimed command can't block
 *  reroute forever. See decideHeadlessReroute. */
export async function recentSwitchAgentStats(
  userId: string,
  tab: string,
): Promise<{ windowCount: number; pending: number }> {
  const rows = await db
    .select({
      windowCount: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where ${pendingCommands.claimedAt} is null)`,
    })
    .from(pendingCommands)
    .where(and(
      eq(pendingCommands.userId, userId),
      eq(pendingCommands.type, "switch_agent"),
      sql`${pendingCommands.payload}->>'tab' = ${tab}`,
      sql`${pendingCommands.createdAt} > now() - interval '15 minutes'`,
    ));
  const r = rows[0];
  return { windowCount: Number(r?.windowCount ?? 0), pending: Number(r?.pending ?? 0) };
}

// Poll endpoint: returns pending (unclaimed) commands for a given user.
export async function getPendingCommandsForUser(userId: string) {
  return db
    .select()
    .from(pendingCommands)
    .where(and(eq(pendingCommands.userId, userId), isNull(pendingCommands.claimedAt)))
    .orderBy(pendingCommands.createdAt);
}

// Returns commands the user should know about: executed-and-failed (ok=false)
// PLUS executed-but-unverified inject commands (ok=true, verified=false — the
// keystrokes landed but the agent didn't react within the post-flight window).
// Limited to the last 10 minutes so a long-running runner doesn't keep
// surfacing stale errors after the user has moved on.
export async function getRecentFailedCommands(userIds: string[]): Promise<FailedCommand[]> {
  if (userIds.length === 0) return [];
  const userFilter = userIds.length === 1
    ? eq(pendingCommands.userId, userIds[0])
    : inArray(pendingCommands.userId, userIds);
  const rows = await db
    .select({
      id: pendingCommands.id,
      type: pendingCommands.type,
      payload: pendingCommands.payload,
      result: pendingCommands.result,
      executedAt: pendingCommands.executedAt,
    })
    .from(pendingCommands)
    .where(and(
      userFilter,
      isNotNull(pendingCommands.executedAt),
      sql`((${pendingCommands.result}->>'ok') = 'false' OR ((${pendingCommands.result}->>'ok') = 'true' AND (${pendingCommands.result}->>'verified') = 'false'))`,
      sql`${pendingCommands.executedAt} > NOW() - INTERVAL '10 minutes'`,
    ))
    .orderBy(desc(pendingCommands.executedAt))
    .limit(20);

  return rows
    .filter((r) => r.executedAt != null)
    .map((r) => {
      const result = (r.result ?? {}) as Record<string, unknown>;
      const isFailure = result.ok === false;
      const isUnverified = result.ok === true && result.verified === false;
      const error = isFailure
        ? (result.error as string) ?? "command failed"
        : (result.warning as string) ?? "delivered but agent did not pick up";
      return {
        id: r.id,
        tab: (r.payload as Record<string, unknown>)?.tab as string ?? "unknown",
        type: r.type,
        error,
        executedAt: r.executedAt!.toISOString(),
        ...(isUnverified ? { unverified: true as const } : {}),
      };
    });
}
