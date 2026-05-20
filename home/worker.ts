#!/usr/bin/env -S npx tsx
/**
 * Worker — M8.
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
 */

import { tailLog, type EventPhase } from "./log";
import { appendEvent, LOG_PATH } from "./emit";
import { injectIntoTab } from "@/lib/zellij";
import { APP_NAME, APP_SLUG } from "@/config/brand";
import type { Event } from "@/lib/events";

const startedRunIds = new Set<string>();

function handleEvent(event: Event, phase: EventPhase) {
  // Build the started-set during replay so live dispatches we've already
  // handled don't re-fire after a restart.
  if (event.kind === "worker.started" && event.runId) {
    startedRunIds.add(event.runId);
    return;
  }
  if (event.kind !== "bridge.dispatch") return;
  if (startedRunIds.has(event.runId)) return;     // already handled

  if (phase === "replay") {
    // Don't inject during replay — only build state. If we see a
    // bridge.dispatch with no matching worker.started downstream in the
    // replay, it'll get picked up by the live handler the moment we hit
    // EOF and the same event re-appears via the next fs.watch fire.
    // But: dispatches in the log that never got a worker.started are a
    // crash-recovery case we want to handle. Pick those up on entering
    // live mode (handled below via the deferred-dispatch list).
    pendingDispatches.set(event.runId, event);
    return;
  }

  // Live event — inject now.
  pendingDispatches.delete(event.runId);
  executeDispatch(event);
}

/** Dispatches seen during replay that don't yet have a worker.started. */
const pendingDispatches = new Map<string, Event>();

function executeDispatch(event: Event) {
  if (event.kind !== "bridge.dispatch") return;
  try {
    injectIntoTab(event.project, event.prompt);
    appendEvent({
      kind: "worker.started",
      project: event.project,
      adapter: "claude",
      intent: event.intent,
      runId: event.runId,
    });
    startedRunIds.add(event.runId);
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

const handle = tailLog(
  LOG_PATH,
  handleEvent,
  (err) => console.error("[worker]", err.message),
);

// After replay completes, any pending dispatches (bridge.dispatch with no
// matching worker.started in the log) are crashes the previous worker run
// didn't get to. fs.watch fires async, so use a microtask to defer this
// until the synchronous replay in tailLog has finished. setImmediate is
// the cleanest signal that the event loop has rolled past replay.
setImmediate(() => {
  if (pendingDispatches.size === 0) return;
  console.log(`[worker] ${pendingDispatches.size} dispatch(es) pending from previous boot — executing`);
  for (const event of pendingDispatches.values()) executeDispatch(event);
  pendingDispatches.clear();
});

console.log(`[worker] ${APP_NAME} dispatch consumer tailing ~/.${APP_SLUG}/events.jsonl`);

const shutdown = (sig: string) => {
  console.log(`[worker] ${sig} — shutting down`);
  handle.close();
  process.exit(0);
};
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
