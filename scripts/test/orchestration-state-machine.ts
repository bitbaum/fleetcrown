/**
 * Regression net for the orchestration run state machine — the transitions
 * 13 of the last 15 commits kept fixing, previously locked by zero tests.
 *
 * Three pure layers, one lifecycle:
 *   1. closeRunFromSession — WHEN an open run may transition to a terminal
 *      state (only a fresh `status: ready` handoff; stale/working/blocked
 *      never close; closed runs are never re-closed).
 *   2. inferOutcome — WHICH terminal outcome the handoff evidence earns
 *      (user_abort > error > hang > partial > success precedence).
 *   3. state.ts lifecycle derivation — runtime-facts > fresh event > fresh
 *      DB timestamp precedence, 24h sentinel staleness, and the
 *      ready-sentinel → input_requested + task_completed pairing.
 *
 * DB-independent by construction: imports only pure modules (the drizzle
 * schema import is table definitions, no connection — same as dod-gate.ts).
 * Run: npx tsx scripts/test/orchestration-state-machine.ts
 */
import { closeRunFromSession } from "@/lib/orchestration/close-from-session";
import { inferOutcome } from "@/lib/orchestration/infer-outcome";
import {
  deriveLifecycleState,
  collectRuntimeLifecycleEvents,
  shouldPersistLifecycleEvent,
  type RuntimeLifecycleFacts,
} from "@/lib/orchestration/state";
import { ORCHESTRATION_OUTCOME } from "@/db/schema/orchestration-runs";
import { SENTINEL_VALIDITY_S } from "@/lib/constants/control";
import type { SessionState } from "@/lib/control-types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0 = Date.parse("2026-07-17T10:00:00Z");

function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    status: "ready",
    done: "shipped the fix",
    next: "nothing",
    tests: "12 pass - 0 fail",
    todos: "",
    health: "good",
    mtime: T0 + 60_000, // one minute after run start
    ...overrides,
  };
}

// Delivered: a handoff can only close a run whose prompt actually reached an
// agent. Undelivered runs are covered by undelivered-run-close.ts.
const openRun = {
  startedAt: new Date(T0),
  finishedAt: null,
  payload: { deliveredAt: new Date(T0).toISOString() },
};

// ── 1. closeRunFromSession — terminal-transition gate ──────────────────────

check("fresh ready handoff closes the run as done/success", () => {
  const patch = closeRunFromSession(openRun, session());
  assert(patch !== null, "expected a close patch");
  assert(patch!.state === "done", `expected state=done, got ${patch!.state}`);
  assert(
    patch!.outcome === ORCHESTRATION_OUTCOME.SUCCESS,
    `expected success, got ${patch!.outcome}`,
  );
  assert(patch!.finishedAt instanceof Date, "close patch must stamp finishedAt");
});

check("an already-finished run is NEVER re-closed (idempotency)", () => {
  const closed = { startedAt: new Date(T0), finishedAt: new Date(T0 + 30_000) };
  assert(closeRunFromSession(closed, session()) === null, "re-closed a terminal run");
});

check("status:working must not close the run", () => {
  assert(
    closeRunFromSession(openRun, session({ status: "working" })) === null,
    "working closed the run",
  );
});

check("status:blocked must not close the run", () => {
  assert(
    closeRunFromSession(openRun, session({ status: "blocked" })) === null,
    "blocked closed the run",
  );
});

check("missing status defaults to NOT ready (conservative)", () => {
  assert(
    closeRunFromSession(openRun, session({ status: undefined })) === null,
    "missing status closed the run",
  );
});

check("stale handoff (mtime <= startedAt) cannot close a fresh run", () => {
  assert(
    closeRunFromSession(openRun, session({ mtime: T0 })) === null,
    "handoff at run start closed the run",
  );
  assert(
    closeRunFromSession(openRun, session({ mtime: T0 - 1 })) === null,
    "pre-run handoff closed the run",
  );
});

check("an UNDELIVERED run is never closed by a handoff", () => {
  // No deliveredAt = the prompt never reached an agent, so this handoff is
  // some other run's work. Closing it here stamps a verdict on work that was
  // never done — and `success` auto-resolves the visitor's feedback.
  const undelivered = { startedAt: new Date(T0), finishedAt: null };
  assert(
    closeRunFromSession(undelivered, session()) === null,
    "undelivered run was closed by a handoff",
  );
});

check("status matching is case-insensitive (Ready closes)", () => {
  assert(
    closeRunFromSession(openRun, session({ status: "Ready" })) !== null,
    "Ready did not close",
  );
});

check("critical-health handoff closes as error state, not done", () => {
  const patch = closeRunFromSession(openRun, session({ health: "critical: build broken" }));
  assert(patch !== null, "expected a close patch");
  assert(patch!.state === "error", `expected state=error, got ${patch!.state}`);
  assert(patch!.outcome === ORCHESTRATION_OUTCOME.ERROR, `expected error, got ${patch!.outcome}`);
});

check("close patch carries the handoff evidence into the summary", () => {
  const patch = closeRunFromSession(openRun, session({ done: "merged PR #42" }));
  assert(patch!.summary.done === "merged PR #42", "summary lost the done evidence");
});

// ── 2. inferOutcome — terminal-outcome precedence ──────────────────────────

const HEALTHY = { done: "work", next: "", tests: "5/5 pass", todos: "", health: "good" };

check("user abort outranks everything, even an error", () => {
  const outcome = inferOutcome({ userAbort: true, error: "boom", summary: HEALTHY });
  assert(outcome === ORCHESTRATION_OUTCOME.USER_ABORT, `expected user_abort, got ${outcome}`);
});

check("an execution error is terminal regardless of a healthy summary", () => {
  const outcome = inferOutcome({ error: "spawn failed", summary: HEALTHY });
  assert(outcome === ORCHESTRATION_OUTCOME.ERROR, `expected error, got ${outcome}`);
});

check("tsc failure in the handoff is an error outcome", () => {
  const outcome = inferOutcome({ summary: { ...HEALTHY, tsc: "fail: 3 errors" } });
  assert(outcome === ORCHESTRATION_OUTCOME.ERROR, `expected error, got ${outcome}`);
});

check("no handoff + >30min running = hang", () => {
  const outcome = inferOutcome({ durationMs: 31 * 60 * 1000 });
  assert(outcome === ORCHESTRATION_OUTCOME.HANG, `expected hang, got ${outcome}`);
});

check("no handoff + <30min running is NOT a hang (weak-signal partial)", () => {
  const outcome = inferOutcome({ durationMs: 5 * 60 * 1000 });
  assert(outcome === ORCHESTRATION_OUTCOME.PARTIAL, `expected partial, got ${outcome}`);
});

check("failing tests demote a healthy run to partial", () => {
  const outcome = inferOutcome({ summary: { ...HEALTHY, tests: "3/5 pass" } });
  assert(outcome === ORCHESTRATION_OUTCOME.PARTIAL, `expected partial, got ${outcome}`);
});

check("'12 pass - 0 fail' is a pass, not a false failure match", () => {
  const outcome = inferOutcome({ summary: { ...HEALTHY, tests: "12 pass - 0 fail" } });
  assert(outcome === ORCHESTRATION_OUTCOME.SUCCESS, `expected success, got ${outcome}`);
});

// Honesty must not be punished. Since the close contract started asking agents
// to explain checks they could not run, the `tests:` field carries prose — and
// a bare-word sniff over the whole field turned solon's truthful handoff into a
// false "failing tests" verdict, which skipped the DoD gate entirely (the gate
// only grades a SUCCESS close). Verbatim from the 2026-08-03 run:
check("an explanation containing 'failure' is not a failing-test verdict", () => {
  const outcome = inferOutcome({
    summary: {
      ...HEALTHY,
      tests:
        "no suite — manually verified end-to-end with a headless browser; the vote POST still 500s " +
        "because no Postgres is provisioned here, and that failure occurs before signature verification runs",
    },
  });
  assert(outcome === ORCHESTRATION_OUTCOME.SUCCESS, `expected success, got ${outcome}`);
});

check("'no suite' is an absence, not a failure — the DoD judge decides if it's enough", () => {
  const outcome = inferOutcome({ summary: { ...HEALTHY, tests: "no suite" } });
  assert(outcome === ORCHESTRATION_OUTCOME.SUCCESS, `expected success, got ${outcome}`);
});

check("a real failure in the VERDICT clause still demotes to partial", () => {
  const outcome = inferOutcome({
    summary: { ...HEALTHY, tests: "failing — 2 specs broke after the schema change" },
  });
  assert(outcome === ORCHESTRATION_OUTCOME.PARTIAL, `expected partial, got ${outcome}`);
});

check("explicit failure counts win wherever they appear, even mid-prose", () => {
  const outcome = inferOutcome({
    summary: { ...HEALTHY, tests: "ran the suite — 3 failed after the refactor, tracing now" },
  });
  assert(outcome === ORCHESTRATION_OUTCOME.PARTIAL, `expected partial, got ${outcome}`);
});

check("status:ready + done evidence earns success without a health field", () => {
  const outcome = inferOutcome({ summary: { ...HEALTHY, health: "", status: "ready" } });
  assert(outcome === ORCHESTRATION_OUTCOME.SUCCESS, `expected success, got ${outcome}`);
});

check("done evidence with no health/ready signal stays partial (weak signal)", () => {
  const outcome = inferOutcome({ summary: { ...HEALTHY, health: "" } });
  assert(outcome === ORCHESTRATION_OUTCOME.PARTIAL, `expected partial, got ${outcome}`);
});

// ── 3. state.ts — lifecycle derivation precedence & staleness ──────────────

const NOW_S = Math.floor(T0 / 1000);
const IDLE: RuntimeLifecycleFacts = {
  readyAt: null,
  lockAt: null,
  closingAt: null,
  closedAt: null,
  currentPromptStartedAt: null,
};

check("runtime facts outrank event and DB timestamps", () => {
  const derived = deriveLifecycleState({
    runtime: { ...IDLE, readyAt: NOW_S - 10 },
    events: { input_requested: new Date((NOW_S - 100) * 1000) },
    dbState: { readyAt: new Date((NOW_S - 200) * 1000) } as never,
    nowS: NOW_S,
  });
  assert(derived.readyAt === NOW_S - 10, `runtime must win, got ${derived.readyAt}`);
});

check("fresh event timestamp fills in when runtime has no fact", () => {
  const derived = deriveLifecycleState({
    runtime: IDLE,
    events: { input_requested: new Date((NOW_S - 100) * 1000) },
    nowS: NOW_S,
  });
  assert(derived.readyAt === NOW_S - 100, `expected event ts, got ${derived.readyAt}`);
});

check("stale event (>24h) is dropped — a dead agent must not read ready forever", () => {
  const staleS = NOW_S - SENTINEL_VALIDITY_S - 1;
  const derived = deriveLifecycleState({
    runtime: IDLE,
    events: { input_requested: new Date(staleS * 1000) },
    dbState: { readyAt: new Date(staleS * 1000) } as never,
    nowS: NOW_S,
  });
  assert(derived.readyAt === null, `stale ready leaked through: ${derived.readyAt}`);
});

check("lockAt is runtime-only — never resurrected from events or DB", () => {
  const derived = deriveLifecycleState({ runtime: IDLE, nowS: NOW_S });
  assert(derived.lockAt === null, "lockAt appeared without a runtime fact");
});

check("ready sentinel emits BOTH input_requested and task_completed", () => {
  const events = collectRuntimeLifecycleEvents({ ...IDLE, readyAt: NOW_S });
  const types = events.map((e) => e.type).sort();
  assert(
    types.includes("input_requested") && types.includes("task_completed"),
    `ready sentinel must pair both events, got [${types.join(", ")}]`,
  );
});

check("closed sentinel emits session_closed", () => {
  const events = collectRuntimeLifecycleEvents({ ...IDLE, closedAt: NOW_S });
  assert(
    events.some((e) => e.type === "session_closed"),
    "closedAt did not emit session_closed",
  );
});

check("event persistence is monotonic — older/equal candidates are skipped", () => {
  const candidate = { type: "task_started" as const, at: NOW_S, source: "runtime-prompt" as const };
  assert(shouldPersistLifecycleEvent(candidate, {}), "first-ever event must persist");
  assert(
    !shouldPersistLifecycleEvent(candidate, { task_started: new Date(NOW_S * 1000) }),
    "equal-timestamp event must NOT re-persist",
  );
  assert(
    shouldPersistLifecycleEvent(candidate, { task_started: new Date((NOW_S - 60) * 1000) }),
    "newer event must persist",
  );
});

console.log(`✓ orchestration-state-machine tests passed (${passed} checks)`);
