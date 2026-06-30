/**
 * Application metrics — read-only aggregations over existing tables.
 *
 * Strategy: don't add a metrics infrastructure (no Prometheus, no
 * OpenTelemetry, no separate metrics_* table). Every signal the operator
 * needs is already present in the operational tables — `pending_commands`,
 * `orchestration_runs`, `debug_logs`, `agent_tokens`, `runtime_snapshots`.
 * Aggregating them on demand at /api/metrics costs one query each,
 * returns immediately, and stays accurate without a separate write path.
 *
 * This file is the SSOT for "what does FleetCrown's recent activity look
 * like." When a 2 AM problem fires, the operator hits /api/metrics, sees
 * the spike/dip/null, and knows where to look next.
 *
 * Time windows are hardcoded to 24h. Long-term we'd parameterize, but
 * "what happened today" is the only question the operator actually asks.
 */

import { db } from "@/db";
import { pendingCommands } from "@/db/schema/pending-commands";
import { orchestrationRuns } from "@/db/schema/orchestration-runs";
import { debugLogs } from "@/db/schema/debug-logs";
import { agentTokens } from "@/db/schema/agent-tokens";
import { runtimeSnapshots } from "@/db/schema/runtime-snapshots";
import { userProjects } from "@/db/schema/user-projects";
import { and, count, eq, gte, isNotNull, isNull, max, sql } from "drizzle-orm";

const HOURS_24_MS = 24 * 60 * 60 * 1000;

/** Dispatch pipeline health for the last 24h. */
export async function getDispatchMetrics(userId: string) {
  const since = new Date(Date.now() - HOURS_24_MS);

  const [totals, failures, pending, latency] = await Promise.all([
    db.select({ n: count() })
      .from(pendingCommands)
      .where(and(eq(pendingCommands.userId, userId), gte(pendingCommands.createdAt, since))),
    db.select({ n: count() })
      .from(pendingCommands)
      .where(
        and(
          eq(pendingCommands.userId, userId),
          gte(pendingCommands.createdAt, since),
          // A row counts as "failed" if it has a result blob containing
          // {ok: false}. We use a JSONB path; the index is light here
          // because the where clause already filtered by user+time.
          sql`${pendingCommands.result}->>'ok' = 'false'`,
        ),
      ),
    db.select({ n: count() })
      .from(pendingCommands)
      .where(and(eq(pendingCommands.userId, userId), isNull(pendingCommands.executedAt))),
    db.select({
      avgMs: sql<number | null>`avg(extract(epoch from (${pendingCommands.executedAt} - ${pendingCommands.createdAt})) * 1000)`,
    })
      .from(pendingCommands)
      .where(
        and(
          eq(pendingCommands.userId, userId),
          gte(pendingCommands.createdAt, since),
          isNotNull(pendingCommands.executedAt),
        ),
      ),
  ]);

  return {
    total24h: totals[0]?.n ?? 0,
    failed24h: failures[0]?.n ?? 0,
    pending: pending[0]?.n ?? 0,
    avgLatencyMs: latency[0]?.avgMs ? Math.round(latency[0].avgMs) : null,
  };
}

/** Orchestration-run outcomes for the last 24h. */
export async function getRunMetrics(userId: string) {
  const since = new Date(Date.now() - HOURS_24_MS);
  const rows = await db
    .select({ outcome: orchestrationRuns.outcome, n: count() })
    .from(orchestrationRuns)
    .where(and(eq(orchestrationRuns.userId, userId), gte(orchestrationRuns.startedAt, since)))
    .groupBy(orchestrationRuns.outcome);

  // Reshape to a flat object so the JSON response is greppable: outcomeCounts.success vs outcomeCounts.error.
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const key = r.outcome ?? "in_progress";
    counts[key] = r.n;
    total += r.n;
  }
  return { total24h: total, outcomes: counts };
}

/** Error log breakdown by source for the last 24h. debug_logs is not
 *  user-scoped (no user_id column — see the schema file header), so this
 *  view is system-wide. That's the right scope anyway: an error spike on
 *  a different user's request path is still operationally relevant. */
export async function getErrorLogMetrics() {
  const since = new Date(Date.now() - HOURS_24_MS);
  const rows = await db
    .select({ source: debugLogs.source, n: count() })
    .from(debugLogs)
    .where(and(eq(debugLogs.level, "error"), gte(debugLogs.createdAt, since)))
    .groupBy(debugLogs.source);

  const bySource: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    bySource[r.source] = r.n;
    total += r.n;
  }
  return { totalErrors24h: total, bySource };
}

/** Live agent-token counts by label — to spot leaks like the event-stream
 *  one we hit on 2026-06-07. */
export async function getTokenMetrics(userId: string) {
  const rows = await db
    .select({ label: agentTokens.label, n: count() })
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .groupBy(agentTokens.label);

  const byLabel: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byLabel[r.label] = r.n;
    total += r.n;
  }
  return { total, byLabel };
}

/** Runner last-seen — how recently the pusher heartbeated. */
export async function getRunnerMetrics(userId: string) {
  const rows = await db
    .select({ lastObserved: max(runtimeSnapshots.observedAt) })
    .from(runtimeSnapshots)
    .where(eq(runtimeSnapshots.userId, userId));

  const last = rows[0]?.lastObserved ?? null;
  return {
    lastSeenAt: last ? last.toISOString() : null,
    secondsAgo: last ? Math.round((Date.now() - last.getTime()) / 1000) : null,
  };
}

/** Project counts. */
export async function getProjectMetrics(userId: string) {
  const rows = await db
    .select({ active: userProjects.isActive, n: count() })
    .from(userProjects)
    .where(eq(userProjects.userId, userId))
    .groupBy(userProjects.isActive);

  let active = 0;
  let inactive = 0;
  for (const r of rows) {
    if (r.active) active += r.n;
    else inactive += r.n;
  }
  return { active, inactive, total: active + inactive };
}
