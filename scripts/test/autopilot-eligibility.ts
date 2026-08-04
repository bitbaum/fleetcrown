/**
 * Inline tests for scheduled-dispatch eligibility.
 *
 * Regression coverage for the 2026-08-02 diagnosis: the nightly autopilot cron
 * dispatched projects whose agents had reported `status: working|blocked`,
 * because the safety gates lived only on the /api/control/dispatch path. Those
 * nudges could not succeed — the agent declines, writes no fresh handoff, and
 * the reaper stamps the run partial/timeout an hour later. 31 of 34 runs in the
 * preceding week were non-success, and this was the dominant cause.
 *
 * The invariant these tests pin: a scheduler and the Control page reach the
 * SAME verdict from the same facts, because they call the same function.
 *
 * Run: npx tsx scripts/test/autopilot-eligibility.ts
 */
import {
  evaluateScheduledDispatch,
  gateInputFromState,
  WORKING_CLAIM_TTL_MS,
  BLOCKED_RECHECK_TTL_MS,
} from "@/lib/orchestration/autopilot-eligibility";
import { evaluateDispatchGates, FAILURE_BRAKE_STREAK } from "@/lib/orchestration/dispatch-gates";
import { MINUTE_MS } from "@/lib/constants/time";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

type State = Parameters<typeof gateInputFromState>[0];
const NOW = Date.parse("2026-08-02T12:00:00Z");
const state = (over: Partial<NonNullable<State>> = {}): State =>
  ({
    sessionStatus: "ready",
    sessionNoOpCount: 0,
    promptQueue: [],
    agentRunning: false,
    sessionUpdatedAt: new Date(NOW - MINUTE_MS), // fresh unless a test says otherwise
    ...over,
  }) as NonNullable<State>;

/**
 * Evaluate against the frozen clock unless a case says otherwise.
 *
 * Every fixture here is dated relative to NOW, so a call that omits `nowMs`
 * silently ages those fixtures against the real clock — and passes only while
 * the wall clock happens to sit near NOW. That is exactly how this file broke:
 * the `blocked` case shipped without `nowMs`, went green, then started failing
 * for everyone 24h later when its one-minute-old fixture crossed
 * BLOCKED_RECHECK_TTL_MS. Defaulting it in one place means no future case can
 * forget it.
 */
const evaluate = (state: State, opts: Parameters<typeof gateInputFromState>[1]) =>
  evaluateScheduledDispatch(state, { nowMs: NOW, ...opts });

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  // ── The bug this file exists for ───────────────────────────────────────

  check("a 'blocked' agent is never dispatched by a scheduler", () => {
    const d = evaluate(state({ sessionStatus: "blocked" }), {
      mode: "on",
      recentOutcomes: [],
    });
    assert(d?.action === "off", "blocked agent must not be nudged");
    assert(d?.source === "status_gate", `expected status_gate, got ${d?.source}`);
  });

  check("a 'working' agent is never interrupted by a scheduler", () => {
    const d = evaluate(state({ sessionStatus: "working" }), {
      mode: "on",
      recentOutcomes: [],
    });
    assert(d?.action === "off", "working agent must not be nudged");
  });

  // ── Stale claims must not deadlock the fleet ───────────────────────────

  check("a STALE 'working' claim with no live agent decays to dispatchable", () => {
    // An agent killed mid-turn leaves `working` written forever. Honoring that
    // literally would freeze the project out of autopilot permanently — a
    // silent failure worse than the loud one this gate replaced.
    const d = evaluate(
      state({
        sessionStatus: "working",
        agentRunning: false,
        sessionUpdatedAt: new Date(NOW - WORKING_CLAIM_TTL_MS - MINUTE_MS),
      }),
      { mode: "on", recentOutcomes: [] },
    );
    assert(d?.action !== "off", "a stale working claim must not gate forever");
  });

  check("a stale 'working' claim is still honored while a process is running", () => {
    const d = evaluate(
      state({
        sessionStatus: "working",
        agentRunning: true,
        sessionUpdatedAt: new Date(NOW - WORKING_CLAIM_TTL_MS - MINUTE_MS),
      }),
      { mode: "on", recentOutcomes: [] },
    );
    assert(d?.action === "off", "a live agent must never be interrupted, however long its turn");
  });

  check("'blocked' outlasts the working TTL — it is a decision, not a liveness claim", () => {
    // surf-your-life's handoff: "autopilot stays off until a human merges PR #7".
    // That must hold for far longer than a working claim does.
    const d = evaluate(
      state({
        sessionStatus: "blocked",
        agentRunning: false,
        sessionUpdatedAt: new Date(NOW - WORKING_CLAIM_TTL_MS - MINUTE_MS),
      }),
      { mode: "on", recentOutcomes: [] },
    );
    assert(d?.action === "off", "a block must not expire on the working clock");
  });

  check("a DAY-OLD block is re-checked, not trusted forever", () => {
    // The deadlock this closes: a blocked project is gated, and a gated agent
    // can never notice the world moved. Both blockers found on 2026-08-02 had
    // already resolved — the Groq key was rotated, PR #7 was merged — while
    // their projects sat waiting on them. One dispatch per day to re-verify.
    const d = evaluate(
      state({
        sessionStatus: "blocked",
        agentRunning: false,
        sessionUpdatedAt: new Date(NOW - BLOCKED_RECHECK_TTL_MS - MINUTE_MS),
      }),
      { mode: "on", recentOutcomes: [] },
    );
    assert(d?.action !== "off", "a stale block must earn one re-check dispatch");
  });

  check("a live agent is never interrupted, blocked or not", () => {
    for (const s of ["blocked", "working"]) {
      const d = evaluate(
        state({
          sessionStatus: s,
          agentRunning: true,
          sessionUpdatedAt: new Date(NOW - BLOCKED_RECHECK_TTL_MS * 10),
        }),
        { mode: "on", recentOutcomes: [] },
      );
      assert(d?.action === "off", `${s} + live process must never be interrupted`);
    }
  });

  check("the no-op fuse stops a scheduler too", () => {
    const d = evaluate(state({ sessionNoOpCount: 3 }), {
      mode: "on",
      recentOutcomes: [],
    });
    assert(d?.action === "off", "no-op loop must not be re-nudged");
  });

  check("the failure brake still applies", () => {
    const failing = Array.from({ length: FAILURE_BRAKE_STREAK }, () => "timeout");
    const d = evaluate(state(), { mode: "on", recentOutcomes: failing });
    assert(d?.action === "off", "failure brake must hold on the scheduled path");
  });

  // ── Still dispatches when it should ────────────────────────────────────

  check("a ready agent with a clean history is dispatched", () => {
    const d = evaluate(state(), { mode: "on", recentOutcomes: ["success"] });
    assert(d?.action !== "off", `ready project must be nudged, got ${d?.action}`);
  });

  check("a project the runner has never described stays dispatchable", () => {
    // No project_states row = unknown, not blocked. Treating unknown as blocked
    // would silently freeze every new project out of autopilot.
    const d = evaluate(null, { mode: "on", recentOutcomes: [] });
    assert(d?.action !== "off", "unknown state must not be treated as blocked");
  });

  check("partial outcomes do NOT trip the failure brake", () => {
    // `partial` means the DoD gate is looping the goal on purpose — progress,
    // not failure. Pinning this so a future 'treat partial as failing' change
    // can't silently switch autopilot off for every goal-mode project.
    const partials = Array.from({ length: FAILURE_BRAKE_STREAK + 2 }, () => "partial");
    const d = evaluate(state(), { mode: "on", recentOutcomes: partials });
    assert(d?.action !== "off", "partial streak must not brake autopilot");
  });

  check("autopilot off (per-project override) refuses", () => {
    const d = evaluate(state(), { mode: "off", recentOutcomes: [] });
    assert(d?.action === "off", "mode off must refuse");
  });

  // ── The SSOT property itself ───────────────────────────────────────────

  check("scheduler and Control reach identical verdicts from identical facts", () => {
    const cases: Array<{ s: State; outcomes: string[] }> = [
      { s: state({ sessionStatus: "blocked" }), outcomes: [] },
      { s: state({ sessionStatus: "working" }), outcomes: [] },
      { s: state({ sessionNoOpCount: 5 }), outcomes: [] },
      { s: state(), outcomes: ["error", "error", "error", "error"] },
      { s: state({ promptQueue: ["do the thing"] }), outcomes: [] },
      { s: state(), outcomes: [] },
    ];
    for (const { s, outcomes } of cases) {
      // "Identical facts" includes the clock — both paths must read the same
      // one, or this compares two different questions.
      const opts = { mode: "on", recentOutcomes: outcomes, nowMs: NOW } as const;
      const viaScheduler = evaluate(s, opts);
      const viaControl = evaluateDispatchGates(gateInputFromState(s, opts));
      assert(
        viaScheduler?.action === viaControl?.action && viaScheduler?.source === viaControl?.source,
        `divergence: scheduler=${viaScheduler?.action}/${viaScheduler?.source} control=${viaControl?.action}/${viaControl?.source}`,
      );
    }
  });

  console.log(`\n${passed} autopilot-eligibility test(s) passed`);
}

runTests();
