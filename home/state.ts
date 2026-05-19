/**
 * Brain state projection.
 *
 * Pure functions only — given the current state and an event, produce the
 * next state. No I/O, no side effects. Lets us unit-test the projection by
 * feeding canned event sequences and asserting on the result.
 *
 * State shape is deliberately minimal in M2: enough to render a meaningful
 * /control view, nothing more. Confidence scores, full run history, and
 * dispatch counters arrive in M5 when the decide() function needs them.
 */

import type { Adapter, Event, Handoff, Outcome } from "@/lib/events";

export type ProjectState = {
  project: string;
  lastEventTs: string;
  /** Currently active run, if any. Cleared on worker.finished / crashed. */
  currentRun?: {
    runId?: string;
    intent: string;
    adapter: Adapter;
    startedAt: string;
    pane?: string;
  };
  lastHandoff?: Handoff;
  lastOutcome?: Outcome;
  /** Newest-first, capped at 5 — drives the streak chip on the UI. */
  recentOutcomes: Outcome[];
};

export type GlobalState = Map<string, ProjectState>;

const RECENT_OUTCOME_LIMIT = 5;

function getOrInit(state: GlobalState, project: string, ts: string): ProjectState {
  const existing = state.get(project);
  if (existing) return { ...existing, recentOutcomes: [...existing.recentOutcomes] };
  return { project, lastEventTs: ts, recentOutcomes: [] };
}

/**
 * Project the next state given the current state and one event.
 * Returns a NEW Map — callers reassign rather than mutate so React-style
 * consumers can use reference equality to detect change.
 */
export function applyEvent(state: GlobalState, event: Event): GlobalState {
  // Only events with a `project` field touch per-project state for now.
  if (!("project" in event)) return state;

  const next = new Map(state);
  const ps = getOrInit(next, event.project, event.ts);
  ps.lastEventTs = event.ts;

  switch (event.kind) {
    case "worker.started":
      ps.currentRun = {
        runId: event.runId,
        intent: event.intent,
        adapter: event.adapter,
        startedAt: event.ts,
        pane: event.pane,
      };
      break;

    case "worker.progress":
      // marker advances the heartbeat but doesn't change run identity.
      break;

    case "worker.idle":
      ps.lastHandoff = event.handoff;
      break;

    case "worker.finished":
      ps.currentRun = undefined;
      ps.lastHandoff = event.handoff;
      ps.lastOutcome = event.outcome;
      ps.recentOutcomes = [event.outcome, ...ps.recentOutcomes].slice(0, RECENT_OUTCOME_LIMIT);
      break;

    case "worker.crashed":
      ps.currentRun = undefined;
      ps.lastOutcome = "error";
      ps.recentOutcomes = ["error" as Outcome, ...ps.recentOutcomes].slice(0, RECENT_OUTCOME_LIMIT);
      break;

    case "bridge.dispatch":
    case "bridge.cancel":
    case "brain.outcome":
      // bridge.* + brain.* don't directly mutate the project view in M2.
      // bridge.dispatch will pre-populate currentRun in M5 when the dispatcher
      // wants the UI to reflect "queued but not yet started" immediately.
      break;
  }

  next.set(event.project, ps);
  return next;
}

/** Apply a stream of events in order. Used at boot to rebuild state from log. */
export function applyAll(events: Iterable<Event>): GlobalState {
  let state: GlobalState = new Map();
  for (const event of events) state = applyEvent(state, event);
  return state;
}
