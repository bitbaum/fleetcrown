import type { ProjectState as DbProjectState } from "@/db/schema/project-states";
import type { CurrentPrompt } from "@/lib/control-types";
import { readTmpTs } from "@/lib/control-fast-state";
import { stateFile } from "@/lib/agent-config";
import {
  collectRuntimeLifecycleEvents,
  deriveLifecycleState,
  shouldPersistLifecycleEvent,
  type DerivedLifecycleState,
  type LifecycleEventSnapshot,
  type RuntimeLifecycleFacts,
} from "@/lib/orchestration/state";
import { createOrchestrationEventOnce } from "@/db/queries/orchestration-events";

export type ProjectLifecycleInput = {
  userId: string;
  projectKey: string;
  liveTab: string;
  runtimeAvailable: boolean;
  dbState?: DbProjectState | null;
  lifecycleEvents?: LifecycleEventSnapshot;
  currentPrompt: CurrentPrompt | null;
  nowS?: number;
  collectAdapterEvents?: (
    facts: RuntimeLifecycleFacts,
  ) => ReturnType<typeof collectRuntimeLifecycleEvents>;
};

export type ProjectLifecycleResult = {
  derived: DerivedLifecycleState;
  runtimeFacts: RuntimeLifecycleFacts;
};

function readRuntimeFacts(
  liveTab: string,
  runtimeAvailable: boolean,
  currentPrompt: CurrentPrompt | null,
): RuntimeLifecycleFacts {
  if (!runtimeAvailable) {
    return {
      readyAt: null,
      lockAt: null,
      closingAt: null,
      closedAt: null,
      currentPromptStartedAt: currentPrompt?.startedAt ?? null,
    };
  }
  return {
    readyAt: readTmpTs(stateFile.ready(liveTab)),
    lockAt: readTmpTs(stateFile.lock(liveTab)),
    closingAt: readTmpTs(stateFile.closing(liveTab)),
    closedAt: readTmpTs(stateFile.closed(liveTab)),
    currentPromptStartedAt: currentPrompt?.startedAt ?? null,
  };
}

/** SSOT: derive lifecycle timestamps from runtime facts + orchestration_events (+ DB fallback). */
export function deriveProjectLifecycle(input: ProjectLifecycleInput): ProjectLifecycleResult {
  const runtimeFacts = readRuntimeFacts(input.liveTab, input.runtimeAvailable, input.currentPrompt);
  const derived = deriveLifecycleState({
    runtime: runtimeFacts,
    events: input.lifecycleEvents,
    dbState: input.dbState,
    nowS: input.nowS ?? Math.floor(Date.now() / 1000),
  });
  return { derived, runtimeFacts };
}

/** Persist newly observed runtime lifecycle events into orchestration_events (idempotent). */
export function persistRuntimeLifecycleEvents(args: {
  userId: string;
  projectKey: string;
  runtimeFacts: RuntimeLifecycleFacts;
  lifecycleEvents?: LifecycleEventSnapshot;
  collectAdapterEvents?: ProjectLifecycleInput["collectAdapterEvents"];
}): void {
  const events =
    args.collectAdapterEvents?.(args.runtimeFacts) ??
    collectRuntimeLifecycleEvents(args.runtimeFacts);

  for (const event of events) {
    if (!shouldPersistLifecycleEvent(event, args.lifecycleEvents)) continue;
    void createOrchestrationEventOnce(
      {
        userId: args.userId,
        projectKey: args.projectKey,
        eventType: event.type,
        source: event.source,
        detail: event.detail,
        happenedAt: new Date(event.at * 1000),
      },
      `runtime:${args.userId}:${args.projectKey.toLowerCase()}:${event.type}:${event.source}:${event.at}`,
    ).catch((err) => console.error("[orchestration] createOrchestrationEvent failed:", err));
  }
}
