#!/usr/bin/env -S npx tsx
/**
 * Worker — M8 + M9 fix.
 *
 * Tails the same JSONL log the Brain reads, but with a different lens: when
 * a bridge.dispatch event arrives that hasn't already been started, inject
 * the prompt into the right zellij tab and emit a worker.started event back
 * to the log. On injection failure, emit worker.crashed.
 *
 * This is the consumer half of the dispatch loop. Together with M3's
 * watcher (worker.idle from session.md changes) and M4's stop-hook
 * emission (worker.finished), the loop now closes locally:
 *
 *   user/UI → POST /api/dispatch → bridge.dispatch event
 *        → worker (this process) → injectIntoTab → claude runs
 *        → claude writes session.md → M3 watcher → worker.idle event
 *        → claude stop hook → M4 emit_worker_finished → worker.finished event
 *        → Brain projects all of it back into state
 *
 * Idempotency: on boot, the replay phase builds a set of runIds that
 * already have a worker.started event in the log. The live phase only acts
 * on dispatches whose runId is NOT in that set — so restarting the worker
 * never re-injects.
 *
 * Run:    npx tsx home/worker.ts
 * Test:   npx tsx home/worker.ts --self-test
 */

import { tailLog, type EventPhase } from "./log";
import { appendEvent, LOG_PATH } from "./emit";
import { injectIntoTab, sendRawKey } from "@/lib/zellij";
import { APP_NAME, APP_SLUG } from "@/config/brand";
import type { Event } from "@/lib/events";

/** Linux Ctrl+C raw key code. Same value used by switch-agent for hard interrupt. */
const CTRL_C = 3;

// ── State held by the worker process ────────────────────────────────────────

export type WorkerState = {
  /** runIds that have a worker.started event downstream — already handled. */
  startedRunIds: Set<string>;
  /** bridge.dispatch events seen during replay with no matching worker.started yet.
   *  Anything still here after replay completes is genuine crash recovery. */
  pendingDispatches: Map<string, Event>;
};

export function makeWorkerState(): WorkerState {
  return { startedRunIds: new Set(), pendingDispatches: new Map() };
}

/**
 * Pure state-transition for an incoming event. No I/O, no injection.
 * Replay events build state. Live events return a `dispatch` request
 * the caller is supposed to execute.
 */
export function applyEvent(
  state: WorkerState,
  event: Event,
  phase: EventPhase,
): { dispatch?: Event; cancel?: Event } {
  // worker.started AND worker.crashed both terminate a runId from the
  // worker's POV — one succeeded, the other failed permanently. Either
  // way, don't re-inject. Without crashed-as-terminator, a failed
  // dispatch (e.g. wrong tab name) gets retried on every worker restart
  // and emits a fresh worker.crashed each time.
  if ((event.kind === "worker.started" || event.kind === "worker.crashed") && event.runId) {
    state.startedRunIds.add(event.runId);
    state.pendingDispatches.delete(event.runId);
    return {};
  }
  // bridge.cancel ALSO terminates a runId: drop it from pendingDispatches so
  // crash-recovery on next boot doesn't re-fire a dispatch the user already
  // killed. Live cancels also signal the caller to send Ctrl+C to the tab.
  if (event.kind === "bridge.cancel") {
    state.startedRunIds.add(event.runId);
    state.pendingDispatches.delete(event.runId);
    return phase === "live" ? { cancel: event } : {};
  }
  if (event.kind !== "bridge.dispatch") return {};
  if (state.startedRunIds.has(event.runId)) return {};   // already handled

  if (phase === "replay") {
    // Track dispatches without a matching worker.started yet. If one
    // appears later in the replay, the branch above clears it; what's
    // left at replay's end is genuine crash recovery.
    state.pendingDispatches.set(event.runId, event);
    return {};
  }

  // Live event — caller should inject now.
  state.pendingDispatches.delete(event.runId);
  return { dispatch: event };
}

// ── Side-effect: actually inject + emit worker.started ──────────────────────

/**
 * Side-effect: send Ctrl+C to the project's tab. Symmetric to executeDispatch —
 * worker is the only process that touches zellij, regardless of intent.
 *
 * The stop hook that runs when the agent shuts down will still emit a
 * worker.finished event with whatever outcome infer_outcome_v1 derives from
 * the session.md at that moment (typically "partial" when done is empty),
 * so the brain's state catches up naturally without us forging a finish here.
 */
function executeCancel(event: Event) {
  if (event.kind !== "bridge.cancel") return;
  try {
    sendRawKey(event.project, CTRL_C);
    console.log(`[worker] sent Ctrl+C to project=${event.project} runId=${event.runId} reason=${event.reason}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[worker] cancel failed runId=${event.runId}: ${msg}`);
  }
}

function executeDispatch(state: WorkerState, event: Event) {
  if (event.kind !== "bridge.dispatch") return;
  try {
    injectIntoTab(event.project, event.prompt);
    appendEvent({
      kind: "worker.started",
      project: event.project,
      // Echo the brain's adapter choice if it set one, else claude default
      // (matches the existing default agent in src/lib/agent-preferences.ts).
      adapter: event.adapter ?? "claude",
      intent: event.intent,
      runId: event.runId,
    });
    state.startedRunIds.add(event.runId);
    console.log(`[worker] injected runId=${event.runId} intent=${event.intent} project=${event.project}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendEvent({
      kind: "worker.crashed",
      project: event.project,
      runId: event.runId,
      error: `inject failed: ${msg}`,
    });
    console.error(`[worker] inject failed runId=${event.runId}: ${msg}`);
  }
}

// ── Main boot ────────────────────────────────────────────────────────────────

function start() {
  const state = makeWorkerState();

  const handle = tailLog(
    LOG_PATH,
    (event, phase) => {
      const { dispatch, cancel } = applyEvent(state, event, phase);
      if (dispatch) executeDispatch(state, dispatch);
      if (cancel)   executeCancel(cancel);
    },
    (err) => console.error("[worker]", err.message),
  );

  // After replay completes, fire any pending dispatches (genuine crash
  // recovery). tailLog's replay is synchronous, so by the time this runs
  // the state map is settled.
  setImmediate(() => {
    if (state.pendingDispatches.size === 0) return;
    console.log(`[worker] ${state.pendingDispatches.size} dispatch(es) pending from previous boot — executing`);
    for (const event of state.pendingDispatches.values()) executeDispatch(state, event);
    state.pendingDispatches.clear();
  });

  console.log(`[worker] ${APP_NAME} dispatch consumer tailing ~/.${APP_SLUG}/events.jsonl`);

  const shutdown = (sig: string) => {
    console.log(`[worker] ${sig} — shutting down`);
    handle.close();
    process.exit(0);
  };
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/worker.ts --self-test
// Drives applyEvent() with canned event sequences and asserts on the state.
// Doesn't boot the tail or call injectIntoTab — pure state-transition only.

function selfTest() {
  const fresh = () => makeWorkerState();
  const dispatchEvent = (runId: string): Event => ({
    v: 1, id: runId, ts: "2026-01-01T00:00:00Z",
    kind: "bridge.dispatch", project: "Test", intent: "next_best",
    prompt: "go", runId, autonomy: "confirm",
  });
  const startedEvent = (runId: string): Event => ({
    v: 1, id: `started-${runId}`, ts: "2026-01-01T00:01:00Z",
    kind: "worker.started", project: "Test", adapter: "claude",
    intent: "next_best", runId,
  });
  const crashedEvent = (runId: string): Event => ({
    v: 1, id: `crashed-${runId}`, ts: "2026-01-01T00:01:00Z",
    kind: "worker.crashed", project: "Test", runId,
    error: "inject failed: tab not found",
  });
  const cancelEvent = (runId: string): Event => ({
    v: 1, id: `cancel-${runId}`, ts: "2026-01-01T00:02:00Z",
    kind: "bridge.cancel", project: "Test", runId, reason: "user clicked Cancel",
  });

  type Case = { name: string; run: () => boolean };
  const cases: Case[] = [
    {
      name: "live dispatch returns the event for caller to execute",
      run: () => {
        const s = fresh();
        const r = applyEvent(s, dispatchEvent("a"), "live");
        return r.dispatch?.kind === "bridge.dispatch" && s.pendingDispatches.size === 0;
      },
    },
    {
      name: "replay dispatch goes to pending, not executed",
      run: () => {
        const s = fresh();
        const r = applyEvent(s, dispatchEvent("a"), "replay");
        return r.dispatch === undefined && s.pendingDispatches.has("a");
      },
    },
    {
      name: "BUG FIX — replayed dispatch followed by replayed worker.started is cleared from pending",
      run: () => {
        const s = fresh();
        applyEvent(s, dispatchEvent("a"), "replay");
        applyEvent(s, startedEvent("a"),  "replay");
        return s.pendingDispatches.size === 0 && s.startedRunIds.has("a");
      },
    },
    {
      name: "replayed dispatch without a worker.started stays in pending (crash recovery)",
      run: () => {
        const s = fresh();
        applyEvent(s, dispatchEvent("a"), "replay");
        applyEvent(s, dispatchEvent("b"), "replay");
        applyEvent(s, startedEvent("a"),  "replay");
        // 'a' resolved, 'b' is the crash-recovery candidate.
        return s.pendingDispatches.size === 1 && s.pendingDispatches.has("b");
      },
    },
    {
      name: "live dispatch is skipped if startedRunIds already has it",
      run: () => {
        const s = fresh();
        applyEvent(s, startedEvent("a"), "replay");
        const r = applyEvent(s, dispatchEvent("a"), "live");
        return r.dispatch === undefined;
      },
    },
    {
      name: "BUG FIX — worker.crashed terminates the runId so replay doesn't re-inject failed dispatches",
      run: () => {
        const s = fresh();
        applyEvent(s, dispatchEvent("a"), "replay");
        applyEvent(s, crashedEvent("a"),  "replay");
        // After a crashed event, the run is done — no pending recovery, no
        // chance of a live re-dispatch firing again.
        return s.pendingDispatches.size === 0 && s.startedRunIds.has("a");
      },
    },
    {
      name: "live bridge.dispatch is skipped when a prior crash already terminated the runId",
      run: () => {
        const s = fresh();
        applyEvent(s, crashedEvent("a"), "replay");
        const r = applyEvent(s, dispatchEvent("a"), "live");
        return r.dispatch === undefined;
      },
    },
    {
      name: "live bridge.cancel returns the event so caller sends Ctrl+C",
      run: () => {
        const s = fresh();
        applyEvent(s, startedEvent("a"), "live");
        const r = applyEvent(s, cancelEvent("a"), "live");
        return r.cancel?.kind === "bridge.cancel" && r.cancel.runId === "a";
      },
    },
    {
      name: "replay bridge.cancel does NOT emit a Ctrl+C (history, not now)",
      run: () => {
        const s = fresh();
        const r = applyEvent(s, cancelEvent("a"), "replay");
        return r.cancel === undefined && s.startedRunIds.has("a");
      },
    },
    {
      name: "bridge.cancel during replay drops a pending dispatch (don't crash-recover a cancelled run)",
      run: () => {
        const s = fresh();
        applyEvent(s, dispatchEvent("a"), "replay");
        applyEvent(s, cancelEvent("a"),   "replay");
        return s.pendingDispatches.size === 0 && s.startedRunIds.has("a");
      },
    },
    {
      name: "live dispatch is skipped when a prior cancel already terminated the runId",
      run: () => {
        const s = fresh();
        applyEvent(s, cancelEvent("a"), "live");
        const r = applyEvent(s, dispatchEvent("a"), "live");
        return r.dispatch === undefined;
      },
    },
    {
      name: "unrelated event types are no-ops on state",
      run: () => {
        const s = fresh();
        const idle: Event = {
          v: 1, id: "i1", ts: "2026-01-01T00:00:00Z",
          kind: "worker.idle", project: "Test",
          handoff: { done: "", next: "", tests: "", todos: "", health: "good" },
        };
        applyEvent(s, idle, "live");
        return s.startedRunIds.size === 0 && s.pendingDispatches.size === 0;
      },
    },
  ];

  let pass = 0, fail = 0;
  for (const c of cases) {
    if (c.run()) { console.log(`  ✓ ${c.name}`); pass++; }
    else         { console.log(`  ✗ ${c.name}`); fail++; }
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

// Dispatch on argv. Naked `npx tsx home/worker.ts` is the foot-gun that
// started this whole pile-on of strays — a test loop piping its output
// through `tail -3` would leave a hot worker injecting random prompts
// into zellij tabs hours later. Require an explicit flag so accidental
// one-shot invocations exit cleanly.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--self-test")) selfTest();
  else if (process.argv.includes("--start")) start();
  else {
    console.log(`${APP_NAME} worker — Consumer layer of the home/ stack.
Tails ~/.${APP_SLUG}/events.jsonl and injects bridge.dispatch prompts into zellij tabs.
Usage:  npx tsx home/worker.ts --start       (boot the consumer)
        npx tsx home/worker.ts --self-test   (run inline tests, no I/O)`);
    process.exit(0);
  }
}
