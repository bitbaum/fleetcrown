/**
 * Pre-decision safety gates for the /api/control/dispatch route. Centralized
 * so the route handler stays focused on the simple queue-vs-nextbest
 * decision and so the gate invariants can be unit-tested without a running
 * server.
 *
 * Gate precedence (first matching wins):
 *   1. handoff.status === "working" or "blocked" — agent declared unavailable; never interrupt
 *   2. blockerCount > 0     — human-action gate is open; wait for clear
 *   3. noOpCount >= 3       — repeated no-op loop; require state change
 *   4. mode === "off"       — user disabled autopilot
 *   5. mode === "on"        — fire queue head if non-empty, else nextbest
 *
 * After the 2026-06-11 mode collapse there's no fall-through to a strategist
 * composer — the route returns whatever this function returns. The Groq
 * composition path was removed entirely; autopilot fires the user's queue
 * or the canned next_best template. Safety rails 1-3 are preserved.
 */

import type { DispatchAction, DispatchResult } from "@/app/api/control/dispatch/route";
import type { AutoInjectMode } from "@/config/beacon";
import { SESSION_STATUS } from "@/lib/constants/statuses";

export type GateInput = {
  status: string;
  blockerCount: number;
  mode: AutoInjectMode;
  queueLength: number;
  streakSuffix: string;
  noOpCount?: number;
  /** Most-recent-first finished outcomes for this project (route already
   *  fetches them for the streak suffix). Feeds the failure brake. */
  recentOutcomes?: string[];
};

/** How many consecutive most-recent failures trip the failure brake. */
export const FAILURE_BRAKE_STREAK = 3;

const BRAKE_FAILURES = new Set(["error", "hang", "timeout"]);

/** Leading run of hard failures (user_abort is neutral and breaks the run,
 *  as does any success/partial). */
export function leadingFailureStreak(outcomes: string[]): number {
  let n = 0;
  for (const o of outcomes) {
    if (BRAKE_FAILURES.has(o)) n++;
    else break;
  }
  return n;
}

export function evaluateDispatchGates(input: GateInput): DispatchResult | null {
  const { status, blockerCount, mode, queueLength, streakSuffix, noOpCount = 0, recentOutcomes = [] } = input;

  if (status === SESSION_STATUS.WORKING || status === SESSION_STATUS.BLOCKED) {
    return {
      action: "off",
      reason: `Agent reported status:${status} — autopilot must not interrupt this turn.`,
      source: "status_gate",
    };
  }

  if (blockerCount > 0) {
    return {
      action: "off",
      reason: `${blockerCount} pending blocker file(s) — autopilot waits until the user clears the human-action gate.`,
      source: "blocker_gate",
    };
  }

  if (noOpCount >= 3) {
    return {
      action: "off",
      reason: `No-op fuse tripped after ${noOpCount} consecutive no-op turn(s) — autopilot waits for a real state change or human reset.`,
      source: "status_gate",
    };
  }

  // Failure brake: when the last N runs ALL failed (error/hang/timeout), keep
  // re-firing is pure waste — the July credential outage burned a week of
  // daily next_best timeouts because nothing checked the streak. A manual
  // dispatch (or any success) resets the streak and re-opens autopilot.
  const failStreak = leadingFailureStreak(recentOutcomes);
  if (failStreak >= FAILURE_BRAKE_STREAK) {
    return {
      action: "off",
      reason: `Failure brake: last ${failStreak} runs all failed.${streakSuffix} Autopilot pauses this project until a run succeeds — dispatch manually to retry.`,
      source: "status_gate",
    };
  }

  if (mode === "off") {
    return {
      action: "off",
      reason: "Auto-inject is disabled in your beacon settings.",
      source: "mode_gate",
    };
  }

  // mode === "on": fire queue head when present, otherwise the canned
  // next_best recovery template. No strategist composition, no Groq call.
  const fired: DispatchAction = queueLength > 0 ? "queue" : "nextbest";
  return {
    action: fired,
    reason: queueLength > 0
      ? `Autopilot on — firing queue item 1.${streakSuffix}`
      : `Autopilot on, queue empty — firing next_best.${streakSuffix}`,
    source: queueLength > 0 ? "mode_gate" : "empty_queue",
  };
}
