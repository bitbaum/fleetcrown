import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { promptHistory } from "@/db/schema/prompt-history";
import { excludeSmokeDispatchesSql } from "./smoke-filter";
import { orchestrationEvents } from "@/db/schema/orchestration-events";
import { orchestrationRuns } from "@/db/schema/orchestration-runs";
import { runStatus, toPromptDisplayFields } from "@/lib/activity-status";
import type { StatusTone } from "@/lib/constants/statuses";
import { getIntentLabel } from "@/config/control-intents";
import type { OrchestrationEventType } from "@/lib/orchestration";
import { DAY_MS } from "@/lib/constants/time";

/**
 * Unified per-project activity — the SSOT read-model for "what happened" on a
 * project. FleetCrown records activity across three specialized tables
 * (prompt_history = dispatches, orchestration_runs = run outcomes,
 * orchestration_events = lifecycle signals). Every surface that wants "the
 * timeline" previously re-merged these ad-hoc, which is how the Control table's
 * Activity column ended up empty and the status chip drifted from reality. This
 * is the one place that merges them into a single typed, time-ordered stream;
 * the Activity feed, the per-project column, and state-recency all read it.
 *
 * Partitioned to avoid double-counting: a dispatch IS the start of work, so we
 * take starts from prompt_history; completions/failures (with outcome + health)
 * from orchestration_runs; and only the mid-flight SIGNALS the other two can't
 * express (input_requested, session_closed) from orchestration_events. A light
 * cross-source de-dup collapses the rare case where a failure lands in both
 * runs and events.
 */

export const ACTIVITY_KINDS = [
  "dispatch",
  "task_completed",
  "task_failed",
  "input_requested",
  "session_closed",
  "funding",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ProjectActivityEvent = {
  /** Stable id (prefixed by source so ids never collide across tables). */
  id: string;
  projectKey: string;
  /** ISO 8601 — serializable straight through the JSON API. */
  at: string;
  kind: ActivityKind;
  /** Where it came from: "user" | "autopilot" | "runner" | the event's source. */
  source: string;
  adapter: string | null;
  intent: string | null;
  /** One-line primary text (already trimmed + single-line). */
  title: string;
  /** Optional secondary detail. */
  detail: string | null;
  /** Dot/severity tone, reusing the app's shared classifier. */
  status: StatusTone;
};

// Lifecycle signals the dispatch/run rows don't already express. task_failed is
// included so local/direct-mode failures (which never create a run row) still
// surface; cross-source de-dup removes the cloud-mode overlap with runs.
const SIGNAL_EVENT_TYPES: OrchestrationEventType[] = [
  "input_requested",
  "session_closed",
  "task_failed",
  "funding",
];

const EVENT_TITLES: Partial<Record<OrchestrationEventType, string>> = {
  input_requested: "Input requested",
  session_closed: "Session closed",
  funding: "Funding settled",
  task_failed: "Task failed",
};

const EVENT_TONE: Partial<Record<OrchestrationEventType, StatusTone>> = {
  input_requested: "warning",
  session_closed: "neutral",
  task_failed: "negative",
};

/** Collapse to one line and cap length so a long prompt never blows out a row. */
function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

type DispatchRow = {
  id: string;
  projectKey: string;
  adapter: string;
  intent: string;
  customPrompt: string | null;
  resolvedPrompt: string | null;
  dispatchedAt: Date;
};

type RunRow = {
  id: string;
  projectKey: string;
  adapter: string;
  intent: string;
  state: string;
  outcome: string | null;
  payload: { error?: string } | null;
  summary: { done?: string; commit?: string } | null;
  finishedAt: Date | null;
};

type EventRow = {
  id: string;
  projectKey: string;
  eventType: OrchestrationEventType;
  source: string;
  adapter: string | null;
  intent: string | null;
  detail: string | null;
  happenedAt: Date;
};

function dispatchToEvent(r: DispatchRow): ProjectActivityEvent {
  const display = toPromptDisplayFields(r);
  return {
    id: `dispatch:${r.id}`,
    projectKey: r.projectKey,
    at: r.dispatchedAt.toISOString(),
    kind: "dispatch",
    source: r.intent === "custom" ? "user" : "autopilot",
    adapter: r.adapter,
    intent: r.intent,
    title: oneLine(display.displayText),
    detail: r.intent === "custom" ? null : getIntentLabel(r.intent),
    status: "neutral",
  };
}

function runToEvent(r: RunRow): ProjectActivityEvent {
  const failed = r.outcome === "error" || r.state === "error" || Boolean(r.payload?.error);
  // Did the run actually ship? Surface the captured commit SHA in the title so the
  // timeline shows what landed in git — not just that a run "completed".
  const commit = r.summary?.commit?.trim();
  const committed = commit && commit.toLowerCase() !== "none";
  const shipped = !failed && committed ? ` · ${commit}` : "";
  return {
    id: `run:${r.id}`,
    projectKey: r.projectKey,
    // finishedAt is non-null here (callers filter to finished runs).
    at: (r.finishedAt as Date).toISOString(),
    kind: failed ? "task_failed" : "task_completed",
    source: "runner",
    adapter: r.adapter,
    intent: r.intent,
    title: failed
      ? "Task failed"
      : `Task complete${r.outcome && r.outcome !== "success" ? ` (${r.outcome})` : ""}${shipped}`,
    detail: r.payload?.error
      ? oneLine(r.payload.error)
      : r.summary?.done
        ? oneLine(r.summary.done)
        : null,
    status: runStatus(r),
  };
}

function eventToEvent(r: EventRow): ProjectActivityEvent {
  return {
    id: `event:${r.id}`,
    projectKey: r.projectKey,
    at: r.happenedAt.toISOString(),
    kind: r.eventType as ActivityKind,
    source: r.source,
    adapter: r.adapter,
    intent: r.intent,
    title: EVENT_TITLES[r.eventType] ?? r.eventType,
    detail: r.detail ? oneLine(r.detail) : null,
    status: EVENT_TONE[r.eventType] ?? "neutral",
  };
}

const DEDUP_WINDOW_MS = 5_000;

/** Merge already-mapped events: sort newest-first, then drop a same-kind entry
 *  that lands within DEDUP_WINDOW_MS of another (the runs/events failure overlap). */
function mergeAndDedup(events: ProjectActivityEvent[], limit: number): ProjectActivityEvent[] {
  const sorted = events.sort((a, b) => b.at.localeCompare(a.at));
  const out: ProjectActivityEvent[] = [];
  for (const ev of sorted) {
    const dup = out.find(
      (o) =>
        o.kind === ev.kind &&
        o.projectKey === ev.projectKey &&
        Math.abs(Date.parse(o.at) - Date.parse(ev.at)) < DEDUP_WINDOW_MS,
    );
    if (!dup) out.push(ev);
    if (out.length >= limit) break;
  }
  return out;
}

/** Per-project activity stream, newest first. */
export async function getProjectActivity(
  userId: string,
  projectKey: string,
  { days = 7, limit = 100 }: { days?: number; limit?: number } = {},
): Promise<ProjectActivityEvent[]> {
  const since = new Date(Date.now() - days * DAY_MS);

  const [dispatches, runs, events] = await Promise.all([
    db
      .select({
        id: promptHistory.id,
        projectKey: promptHistory.projectKey,
        adapter: promptHistory.adapter,
        intent: promptHistory.intent,
        customPrompt: promptHistory.customPrompt,
        resolvedPrompt: promptHistory.resolvedPrompt,
        dispatchedAt: promptHistory.dispatchedAt,
      })
      .from(promptHistory)
      .where(
        and(
          eq(promptHistory.userId, userId),
          eq(promptHistory.projectKey, projectKey),
          gte(promptHistory.dispatchedAt, since),
          excludeSmokeDispatchesSql(),
        ),
      )
      .orderBy(desc(promptHistory.dispatchedAt))
      .limit(limit),
    db
      .select({
        id: orchestrationRuns.id,
        projectKey: orchestrationRuns.projectKey,
        adapter: orchestrationRuns.adapter,
        intent: orchestrationRuns.intent,
        state: orchestrationRuns.state,
        outcome: orchestrationRuns.outcome,
        payload: orchestrationRuns.payload,
        summary: orchestrationRuns.summary,
        finishedAt: orchestrationRuns.finishedAt,
      })
      .from(orchestrationRuns)
      .where(
        and(
          eq(orchestrationRuns.userId, userId),
          eq(orchestrationRuns.projectKey, projectKey),
          gte(orchestrationRuns.startedAt, since),
        ),
      )
      .orderBy(desc(orchestrationRuns.startedAt))
      .limit(limit),
    db
      .select({
        id: orchestrationEvents.id,
        projectKey: orchestrationEvents.projectKey,
        eventType: orchestrationEvents.eventType,
        source: orchestrationEvents.source,
        adapter: orchestrationEvents.adapter,
        intent: orchestrationEvents.intent,
        detail: orchestrationEvents.detail,
        happenedAt: orchestrationEvents.happenedAt,
      })
      .from(orchestrationEvents)
      .where(
        and(
          eq(orchestrationEvents.userId, userId),
          eq(orchestrationEvents.projectKey, projectKey),
          inArray(orchestrationEvents.eventType, SIGNAL_EVENT_TYPES),
          gte(orchestrationEvents.happenedAt, since),
        ),
      )
      .orderBy(desc(orchestrationEvents.happenedAt))
      .limit(limit),
  ]);

  const merged = [
    ...dispatches.map(dispatchToEvent),
    ...runs.filter((r) => r.finishedAt !== null).map(runToEvent),
    ...events.map(eventToEvent),
  ];
  return mergeAndDedup(merged, limit);
}

/** Batch variant for the Control page — one round-trip per source table for all
 *  projects, grouped by projectKey. */
export async function getProjectActivityBatch(
  userId: string,
  projectKeys: string[],
  { days = 7, perKey = 20 }: { days?: number; perKey?: number } = {},
): Promise<Map<string, ProjectActivityEvent[]>> {
  const result = new Map<string, ProjectActivityEvent[]>();
  if (projectKeys.length === 0) return result;
  const since = new Date(Date.now() - days * DAY_MS);

  const [dispatches, runs, events] = await Promise.all([
    db
      .select({
        id: promptHistory.id,
        projectKey: promptHistory.projectKey,
        adapter: promptHistory.adapter,
        intent: promptHistory.intent,
        customPrompt: promptHistory.customPrompt,
        resolvedPrompt: promptHistory.resolvedPrompt,
        dispatchedAt: promptHistory.dispatchedAt,
      })
      .from(promptHistory)
      .where(
        and(
          eq(promptHistory.userId, userId),
          inArray(promptHistory.projectKey, projectKeys),
          gte(promptHistory.dispatchedAt, since),
          excludeSmokeDispatchesSql(),
        ),
      )
      .orderBy(desc(promptHistory.dispatchedAt)),
    db
      .select({
        id: orchestrationRuns.id,
        projectKey: orchestrationRuns.projectKey,
        adapter: orchestrationRuns.adapter,
        intent: orchestrationRuns.intent,
        state: orchestrationRuns.state,
        outcome: orchestrationRuns.outcome,
        payload: orchestrationRuns.payload,
        summary: orchestrationRuns.summary,
        finishedAt: orchestrationRuns.finishedAt,
      })
      .from(orchestrationRuns)
      .where(
        and(
          eq(orchestrationRuns.userId, userId),
          inArray(orchestrationRuns.projectKey, projectKeys),
          gte(orchestrationRuns.startedAt, since),
        ),
      )
      .orderBy(desc(orchestrationRuns.startedAt)),
    db
      .select({
        id: orchestrationEvents.id,
        projectKey: orchestrationEvents.projectKey,
        eventType: orchestrationEvents.eventType,
        source: orchestrationEvents.source,
        adapter: orchestrationEvents.adapter,
        intent: orchestrationEvents.intent,
        detail: orchestrationEvents.detail,
        happenedAt: orchestrationEvents.happenedAt,
      })
      .from(orchestrationEvents)
      .where(
        and(
          eq(orchestrationEvents.userId, userId),
          inArray(orchestrationEvents.projectKey, projectKeys),
          inArray(orchestrationEvents.eventType, SIGNAL_EVENT_TYPES),
          gte(orchestrationEvents.happenedAt, since),
        ),
      )
      .orderBy(desc(orchestrationEvents.happenedAt)),
  ]);

  const byKey = new Map<string, ProjectActivityEvent[]>();
  const push = (ev: ProjectActivityEvent) => {
    const list = byKey.get(ev.projectKey) ?? [];
    list.push(ev);
    byKey.set(ev.projectKey, list);
  };
  dispatches.map(dispatchToEvent).forEach(push);
  runs
    .filter((r) => r.finishedAt !== null)
    .map(runToEvent)
    .forEach(push);
  events.map(eventToEvent).forEach(push);

  for (const key of projectKeys) {
    result.set(key, mergeAndDedup(byKey.get(key) ?? [], perKey));
  }
  return result;
}
