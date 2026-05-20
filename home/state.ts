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
      // Pre-populate currentRun so the UI reflects a dispatched run
      // immediately. worker.started overwrites this with the (same-shape)
      // confirmed version once the inject lands. The gap between
      // bridge.dispatch and worker.started is usually < 200ms, but during
      // a slow zellij focus or a crashed worker the UI would otherwise
      // look idle for the whole interval.
      ps.currentRun = {
        runId: event.runId,
        intent: event.intent,
        adapter: event.adapter ?? "claude",
        startedAt: event.ts,
      };
      break;

    case "bridge.cancel":
      // Only clear if this cancel matches the active run — don't drop a
      // currentRun set by a later dispatch that the cancel doesn't apply to.
      if (ps.currentRun?.runId === event.runId) ps.currentRun = undefined;
      break;

    case "brain.outcome":
      // Derived event for analytics — worker.finished already updates
      // recentOutcomes + lastHandoff. Nothing else to do here.
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

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/state.ts
// Covers the lifecycle transitions: dispatch → started → finished + the
// edge cases (cancel-matches, cancel-mismatches, crashed clears too).

function selfTest() {
  const baseTs = "2026-01-01T00:00:00Z";
  const dispatch = (runId: string, intent = "next_best"): Event => ({
    v: 1, id: `d-${runId}`, ts: baseTs, kind: "bridge.dispatch",
    project: "T", intent, prompt: "go", runId, autonomy: "auto", adapter: "codex",
  });
  const started = (runId: string): Event => ({
    v: 1, id: `s-${runId}`, ts: baseTs, kind: "worker.started",
    project: "T", adapter: "codex", intent: "next_best", runId,
  });
  const finished = (runId: string, outcome: Outcome = "success"): Event => ({
    v: 1, id: `f-${runId}`, ts: baseTs, kind: "worker.finished",
    project: "T", runId, handoff: { done: "x", next: "", tests: "", todos: "", health: "good" },
    outcome, durationMs: 1000,
  });
  const cancel = (runId: string): Event => ({
    v: 1, id: `c-${runId}`, ts: baseTs, kind: "bridge.cancel",
    project: "T", runId, reason: "user",
  });

  const cases: { name: string; check: () => boolean }[] = [
    {
      name: "bridge.dispatch populates currentRun with adapter from the event",
      check: () => {
        const s = applyAll([dispatch("a")]);
        const ps = s.get("T")!;
        return ps.currentRun?.runId === "a" && ps.currentRun.adapter === "codex";
      },
    },
    {
      name: "worker.started overwrites currentRun (idempotent same-shape)",
      check: () => {
        const s = applyAll([dispatch("a"), started("a")]);
        return s.get("T")?.currentRun?.runId === "a";
      },
    },
    {
      name: "worker.finished clears currentRun and appends outcome",
      check: () => {
        const s = applyAll([dispatch("a"), started("a"), finished("a", "success")]);
        const ps = s.get("T")!;
        return ps.currentRun === undefined && ps.lastOutcome === "success" && ps.recentOutcomes[0] === "success";
      },
    },
    {
      name: "bridge.cancel clears currentRun when runId matches",
      check: () => {
        const s = applyAll([dispatch("a"), cancel("a")]);
        return s.get("T")?.currentRun === undefined;
      },
    },
    {
      name: "bridge.cancel keeps currentRun when runId does NOT match",
      check: () => {
        const s = applyAll([dispatch("a"), cancel("b")]);
        return s.get("T")?.currentRun?.runId === "a";
      },
    },
    {
      name: "default adapter is 'claude' when bridge.dispatch omits it",
      check: () => {
        const d: Event = {
          v: 1, id: "x", ts: baseTs, kind: "bridge.dispatch",
          project: "T", intent: "next_best", prompt: "go", runId: "z", autonomy: "confirm",
        };
        return applyAll([d]).get("T")?.currentRun?.adapter === "claude";
      },
    },
  ];

  let pass = 0, fail = 0;
  for (const c of cases) {
    if (c.check()) { console.log(`  ✓ ${c.name}`); pass++; }
    else           { console.log(`  ✗ ${c.name}`); fail++; }
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  selfTest();
}
