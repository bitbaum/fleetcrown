/**
 * Brain — decide() is the only decision function in the new system.
 *
 * Pure: same input → same output, no I/O, no Date.now() side reads. The
 * caller passes in `now` so tests are deterministic. Lets us unit-test
 * the entire autonomy + confidence layer in isolation by feeding canned
 * project states and asserting on the returned command.
 *
 * Reproduces today's /api/control/dispatch logic as the baseline, then
 * layers in confidence (derived from outcome streaks) and autonomy gating
 * (manual / confirm / auto / sleep). M5's job is to *be the decision* —
 * downstream milestones wire its output into dispatch and the UI.
 */

import type { Autonomy, Handoff, Outcome } from "@/lib/events";
import type { ProjectState } from "./state";

// ── Inputs ───────────────────────────────────────────────────────────────────

export type DecideInput = {
  /** The project's current projected state (from home/state.ts). */
  project: ProjectState;
  /** First item in the user's prompt queue for this project, if any. */
  queueHead?: string;
  /** Caller's autonomy preference. Defaults to 'confirm'. */
  autonomy?: Autonomy;
  /** Injected clock for testability. Defaults to new Date(). */
  now?: Date;
};

// ── Outputs ──────────────────────────────────────────────────────────────────

export type DecisionAction =
  /** Nothing to do — show the project as idle / waiting. */
  | { kind: "wait";     reason: string }
  /** Dispatch a specific intent with optional pre-rendered prompt. */
  | { kind: "dispatch"; intent: string; prompt?: string; queueItem?: string; reason: string }
  /** Health is bad — force a recovery intent regardless of queue/autonomy. */
  | { kind: "recovery"; intent: string; reason: string };

export type Decision = {
  action: DecisionAction;
  /** [0,1]. Higher = brain is more sure this is the right call right now. */
  confidence: number;
  /**
   * True when the autonomy mode + confidence combine to "fire without
   * asking." False means "show the proposed action; let the user confirm
   * or override." Sleep mode hardens this gate.
   */
  autoExecute: boolean;
};

// ── Confidence model ─────────────────────────────────────────────────────────
// v1 is deliberately simple: a weighted score over the last 5 outcomes.
// Errors are weighted 2x against confidence; partials are neutral; user
// aborts read as "fine, the human steered" and don't hurt confidence.
//
// Empty history defaults to 0.5 — neutral, neither auto-fire nor block.

const OUTCOME_WEIGHT: Record<Outcome, number> = {
  success:    +1.0,
  partial:     0.0,
  error:      -2.0,
  hang:       -2.0,
  timeout:    -1.5,
  user_abort:  0.0,
  // The dispatch never reached an agent. That says nothing about whether
  // this project's work is going well, so it must not move confidence —
  // weighting it like a failure would teach the brain to avoid a project
  // because the delivery path was broken.
  unconfirmed: 0.0,
};

export function computeConfidence(outcomes: Outcome[]): number {
  if (outcomes.length === 0) return 0.5;
  const sum = outcomes.reduce((acc, o) => acc + OUTCOME_WEIGHT[o], 0);
  // Per-outcome weight range is [-2, +1]. Map this piecewise into [0.05, 0.95]
  // anchored at 0.5 for neutral. Asymmetric on purpose: an error costs more
  // than a success earns, so a single 'error' after four 'success' drops you
  // from 0.95 to a much more cautious 0.59 — bad runs scream louder.
  //   avg=+1.0  (all success)         →  0.95
  //   avg=0     (neutral / mixed)     →  0.50
  //   avg=-2.0  (all error)           →  0.05
  const avg = sum / outcomes.length;
  const normalized = avg >= 0
    ? 0.5 + (avg / 1.0) * 0.45
    : 0.5 + (avg / 2.0) * 0.45;
  return Math.max(0, Math.min(1, normalized));
}

// ── Autonomy gating ──────────────────────────────────────────────────────────
// Threshold per mode: below this, hold and ask. At/above, fire.

const AUTONOMY_THRESHOLD: Record<Autonomy, number> = {
  manual:  0,          // human clicked Dispatch — fire on receipt, no gate. The
                       // confidence value still flows through for display, but
                       // it never blocks; the user is the gate.
  confirm: Infinity,   // never auto-execute — UI shows the proposal so the
                       // human can override or click Dispatch (manual) to fire
  auto:    0.55,       // moderate confidence — autonomous scheduler (cron,
                       // queue drain) fires when the gate clears
  sleep:   0.75,       // high confidence — fires while user away IF healthy
};

export function shouldAutoExecute(
  autonomy: Autonomy,
  confidence: number,
  health: string,
  status: string = "",
): boolean {
  // Critical health blocks autoExecute in every mode except manual (which is
  // already false). The brain must surface a recovery prompt, not bury it
  // under sleep-mode autonomy.
  if (health.toLowerCase().includes("critical")) return false;
  // Agent-driven gate: autonomous dispatches (auto, sleep) only fire when
  // the latest handoff EXPLICITLY signals status="ready". Missing, empty,
  // "working", or any other value suppresses. Manual mode bypasses — user
  // clicked Dispatch explicitly, they ARE the gate. Mirrors the cloud
  // /control auto-inject gate from 27f31cb (handleAutoInject) so home/ and
  // cloud agree on when to fire.
  if (autonomy !== "manual" && status.toLowerCase() !== "ready") return false;
  return confidence >= AUTONOMY_THRESHOLD[autonomy];
}

// ── Health gate (mirror of today's hard rules) ───────────────────────────────

function healthDemandsRecovery(handoff?: Handoff): {
  needed: true;
  intent: string;
  reason: string;
} | { needed: false } {
  if (!handoff) return { needed: false };
  const h = (handoff.health ?? "").toLowerCase();
  const t = (handoff.tests  ?? "").toLowerCase();
  if (h.includes("critical")) {
    return { needed: true, intent: "unblock",      reason: "Health critical — focus recovery before anything else." };
  }
  if (t.includes("fail")) {
    return { needed: true, intent: "test_and_fix", reason: "Tests failing — recover green before switching concerns." };
  }
  return { needed: false };
}

// ── The decision ─────────────────────────────────────────────────────────────

export function decide(input: DecideInput): Decision {
  const { project, queueHead, autonomy = "confirm" } = input;
  const confidence = computeConfidence(project.recentOutcomes);
  const health = project.lastHandoff?.health ?? "";
  const status = project.lastHandoff?.status ?? "";

  // 1. If a run is currently active, decide() has nothing to do — let it
  //    finish. The next call after worker.finished will produce the next move.
  if (project.currentRun) {
    return {
      action: { kind: "wait", reason: `${project.currentRun.intent} in flight.` },
      confidence,
      autoExecute: false,
    };
  }

  // 2. Health-critical or tests-failing forces a recovery intent, regardless
  //    of queue contents or autonomy mode (manual still won't auto-fire it,
  //    but it will be proposed).
  const recovery = healthDemandsRecovery(project.lastHandoff);
  if (recovery.needed) {
    return {
      action: { kind: "recovery", intent: recovery.intent, reason: recovery.reason },
      confidence,
      autoExecute: shouldAutoExecute(autonomy, confidence, health, status),
    };
  }

  // 3. Queue has an item → dispatch it. The Groq queue-vs-nextbest classifier
  //    from /api/control/dispatch becomes optional sugar later; for M5 the
  //    baseline is "queue beats nextbest when queue is non-empty and health
  //    is OK". Simple, correct most of the time, replaceable.
  if (queueHead && queueHead.trim().length > 0) {
    return {
      action: {
        kind: "dispatch",
        intent: "custom",
        prompt: queueHead,
        queueItem: queueHead,
        reason: "Draining queue head.",
      },
      confidence,
      autoExecute: shouldAutoExecute(autonomy, confidence, health, status),
    };
  }

  // 4. Empty queue + healthy → AI picks next-best.
  return {
    action: {
      kind: "dispatch",
      intent: "next_best",
      reason: "Queue empty, health good — let the agent pick next.",
    },
    confidence,
    autoExecute: shouldAutoExecute(autonomy, confidence, health, status),
  };
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/decide.ts
// Verifies the decision matrix without requiring a separate test framework.

function selfTest() {
  const baseProject: ProjectState = {
    project: "Test",
    lastEventTs: "2026-01-01T00:00:00Z",
    recentOutcomes: [],
  };

  const cases: { name: string; input: DecideInput; expect: (d: Decision) => boolean }[] = [
    {
      name: "wait when a run is in flight",
      input: {
        project: {
          ...baseProject,
          currentRun: { intent: "next_best", adapter: "claude", startedAt: baseProject.lastEventTs },
        },
      },
      expect: (d) => d.action.kind === "wait" && !d.autoExecute,
    },
    {
      name: "recovery when health is critical",
      input: {
        project: {
          ...baseProject,
          lastHandoff: { status: "", done:"x", next: "", tests: "", todos: "", health: "critical — auth broken" },
        },
      },
      expect: (d) => d.action.kind === "recovery" && d.action.intent === "unblock",
    },
    {
      name: "recovery when tests fail (test_and_fix)",
      input: {
        project: {
          ...baseProject,
          lastHandoff: { status: "", done:"x", next: "", tests: "3/5 pass, 2 fail", todos: "", health: "good" },
        },
      },
      expect: (d) => d.action.kind === "recovery" && d.action.intent === "test_and_fix",
    },
    {
      name: "queue head dispatched when present and health OK",
      input: {
        project: { ...baseProject, lastHandoff: { status: "", done:"x", next: "", tests: "all pass", todos: "0", health: "good" } },
        queueHead: "Run security audit",
      },
      expect: (d) => d.action.kind === "dispatch" && d.action.intent === "custom",
    },
    {
      name: "empty queue + healthy → next_best",
      input: {
        project: { ...baseProject, lastHandoff: { status: "", done:"x", next: "", tests: "all pass", todos: "0", health: "good" } },
      },
      expect: (d) => d.action.kind === "dispatch" && d.action.intent === "next_best",
    },
    {
      name: "manual autonomy ALWAYS auto-executes (human clicked, no gate)",
      input: {
        // Fresh project, zero history. The UI Dispatch button hits this path —
        // it must fire even when computeConfidence is still neutral 0.5.
        project: { ...baseProject, lastHandoff: { status: "", done:"", next: "", tests: "", todos: "", health: "good" } },
        autonomy: "manual",
      },
      expect: (d) => d.autoExecute,
    },
    {
      name: "manual autonomy still blocks when health is critical (recovery first)",
      input: {
        project: {
          ...baseProject,
          lastHandoff: { status: "", done:"x", next: "", tests: "", todos: "", health: "critical — auth broken" },
        },
        autonomy: "manual",
      },
      expect: (d) => !d.autoExecute,
    },
    {
      name: "BUG FIX — confirm autonomy never auto-executes (UI countdown gates the fire)",
      input: {
        project: {
          ...baseProject,
          recentOutcomes: ["success", "success", "success", "success", "success"],
          lastHandoff: { status: "", done:"x", next: "", tests: "all pass", todos: "0", health: "good" },
        },
        autonomy: "confirm",
      },
      expect: (d) => !d.autoExecute,
    },
    {
      name: "sleep mode auto-fires on high confidence + healthy + status=ready",
      input: {
        project: {
          ...baseProject,
          recentOutcomes: ["success", "success", "success", "success", "success"],
          lastHandoff: { status: "ready", done:"x", next: "", tests: "all pass", todos: "0", health: "good" },
        },
        autonomy: "sleep",
      },
      expect: (d) => d.autoExecute && d.confidence > 0.75,
    },
    {
      name: "sleep mode does NOT fire when status='working' (mirrors cloud auto-inject gate)",
      input: {
        project: {
          ...baseProject,
          recentOutcomes: ["success", "success", "success", "success", "success"],
          lastHandoff: { status: "working", done:"x", next: "more to do", tests: "all pass", todos: "0", health: "good" },
        },
        autonomy: "sleep",
      },
      expect: (d) => !d.autoExecute,
    },
    {
      name: "auto mode does NOT fire when status is missing (default-suppress)",
      input: {
        project: {
          ...baseProject,
          recentOutcomes: ["success", "success", "success", "success", "success"],
          lastHandoff: { status: "", done:"x", next: "", tests: "all pass", todos: "0", health: "good" },
        },
        autonomy: "auto",
      },
      expect: (d) => !d.autoExecute,
    },
    {
      name: "manual mode ignores status (user clicked Dispatch, they ARE the gate)",
      input: {
        project: {
          ...baseProject,
          lastHandoff: { status: "working", done:"x", next: "more to do", tests: "all pass", todos: "0", health: "good" },
        },
        autonomy: "manual",
      },
      expect: (d) => d.autoExecute,
    },
    {
      name: "sleep mode holds when recent errors drop confidence",
      input: {
        project: {
          ...baseProject,
          recentOutcomes: ["error", "error", "success"],
          lastHandoff: { status: "", done:"x", next: "", tests: "all pass", todos: "0", health: "good" },
        },
        autonomy: "sleep",
      },
      expect: (d) => !d.autoExecute,
    },
    {
      name: "empty outcome history gives neutral 0.5 confidence",
      input: { project: baseProject },
      expect: (d) => d.confidence === 0.5,
    },
  ];

  let pass = 0, fail = 0;
  for (const c of cases) {
    const result = decide(c.input);
    if (c.expect(result)) {
      console.log(`  ✓ ${c.name}`);
      pass++;
    } else {
      console.log(`  ✗ ${c.name}`);
      console.log(`    got: ${JSON.stringify(result)}`);
      fail++;
    }
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

// Run when invoked directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  selfTest();
}
