import type { ProjectState as DbProjectState } from "@/db/schema/project-states";
import type { OrchestrationEventType } from "./contract";
import { SENTINEL_VALIDITY_S } from "@/lib/constants/control";

export type LifecycleEventSnapshot = Partial<Record<OrchestrationEventType, Date>>;

export type RuntimeLifecycleFacts = {
  readyAt: number | null;
  lockAt: number | null;
  closingAt: number | null;
  closedAt: number | null;
  currentPromptStartedAt: number | null;
};

export type DerivedLifecycleState = {
  readyAt: number | null;
  lockAt: number | null;
  closingAt: number | null;
  closedAt: number | null;
};

type RuntimeEventCandidate = {
  type: OrchestrationEventType;
  at: number;
  source: "runtime-sentinel" | "runtime-prompt";
  detail?: string;
};

function toUnixSeconds(date: Date | null | undefined): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

function resolveTs(
  runtimeTs: number | null,
  eventTs: Date | undefined,
  dbTs: Date | null | undefined,
  nowS: number,
): number | null {
  if (runtimeTs !== null) return runtimeTs;
  const eventS = toUnixSeconds(eventTs);
  if (eventS !== null && (nowS - eventS) < SENTINEL_VALIDITY_S) return eventS;
  const dbS = toUnixSeconds(dbTs);
  if (dbS !== null && (nowS - dbS) < SENTINEL_VALIDITY_S) return dbS;
  return null;
}

export function deriveLifecycleState(args: {
  runtime: RuntimeLifecycleFacts;
  events?: LifecycleEventSnapshot;
  dbState?: DbProjectState | null;
  nowS?: number;
}): DerivedLifecycleState {
  const { runtime, events, dbState } = args;
  const nowS = args.nowS ?? Math.floor(Date.now() / 1000);

  return {
    readyAt: resolveTs(runtime.readyAt, events?.input_requested, dbState?.readyAt, nowS),
    lockAt: runtime.lockAt,
    closingAt: resolveTs(runtime.closingAt, events?.close_requested, dbState?.closingAt, nowS),
    closedAt: resolveTs(runtime.closedAt, events?.session_closed, dbState?.closedAt, nowS),
  };
}

export function collectRuntimeLifecycleEvents(runtime: RuntimeLifecycleFacts): RuntimeEventCandidate[] {
  const events: RuntimeEventCandidate[] = [];

  if (runtime.readyAt !== null) {
    // The "ready" sentinel means the agent is done with the current task
    // AND is waiting for the next input. Both terms are true at the same
    // instant, so emit both events from the single sentinel:
    //   • input_requested — what the UI ready-banner / deriveLifecycleState consume
    //   • task_completed  — closes the task_started lifecycle pair so
    //                       orchestration_events queries can count
    //                       started vs. completed without double-bookkeeping
    // Prior to this, task_completed was a defined event type in the
    // contract but never written — across all-time the table had 336
    // task_started rows and zero task_completed, leaving every dispatch
    // in an indeterminate end-state from a telemetry POV.
    events.push({ type: "input_requested", at: runtime.readyAt, source: "runtime-sentinel" });
    events.push({ type: "task_completed", at: runtime.readyAt, source: "runtime-sentinel" });
  }
  if (runtime.closingAt !== null) {
    events.push({ type: "close_requested", at: runtime.closingAt, source: "runtime-sentinel" });
  }
  if (runtime.closedAt !== null) {
    events.push({ type: "session_closed", at: runtime.closedAt, source: "runtime-sentinel" });
  }
  if (runtime.currentPromptStartedAt !== null && runtime.currentPromptStartedAt > 0) {
    events.push({ type: "task_started", at: runtime.currentPromptStartedAt, source: "runtime-prompt" });
  }

  return events;
}

export function shouldPersistLifecycleEvent(
  event: RuntimeEventCandidate,
  latestEvents?: LifecycleEventSnapshot,
): boolean {
  const latest = latestEvents?.[event.type];
  if (!latest) return true;
  return Math.floor(latest.getTime() / 1000) < event.at;
}
