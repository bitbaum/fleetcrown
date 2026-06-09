/**
 * Pre-Groq gates for the /api/control/dispatch route. Centralized so the
 * route handler stays focused on the strategist composition path and so
 * the gate invariants can be unit-tested without a running server.
 *
 * Gate precedence (first matching wins; all return action="off"):
 *   1. handoff.status === "working" or "blocked" — agent declared unavailable; never interrupt
 *   2. blockerCount > 0             — human-action gate is open; wait for clear
 *   3. noOpCount >= 3               — repeated no-op loop; require state change
 *   4. mode === "off"               — user disabled autopilot in settings
 * Plus the non-off short-circuits:
 *   5. mode === "queue_only"        — fire queue head or stay idle
 *   6. mode === "next_best"         — fire the canned template
 * `null` means "no gate fired — proceed to strategist (Groq composition)".
 */

import type { DispatchAction, DispatchResult } from "@/app/api/control/dispatch/route";
import type { AutoInjectMode } from "@/config/beacon";

export type GateInput = {
  status: string;
  blockerCount: number;
  mode: AutoInjectMode;
  queueLength: number;
  streakSuffix: string;
  noOpCount?: number;
};

export function evaluateDispatchGates(input: GateInput): DispatchResult | null {
  const { status, blockerCount, mode, queueLength, streakSuffix, noOpCount = 0 } = input;

  if (status === "working" || status === "blocked") {
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

  if (mode === "off") {
    return {
      action: "off",
      reason: "Auto-inject is disabled in your beacon settings.",
      source: "mode_gate",
    };
  }

  if (mode === "queue_only") {
    const fired: DispatchAction = queueLength > 0 ? "queue" : "off";
    return {
      action: fired,
      reason: queueLength > 0
        ? `Queue-only mode — firing queue item 1.${streakSuffix}`
        : "Queue-only mode and queue is empty — nothing to do.",
      source: "mode_gate",
    };
  }

  if (mode === "next_best") {
    return {
      action: "nextbest",
      reason: `Legacy next_best mode (no strategist).${streakSuffix}`,
      source: "mode_gate",
    };
  }

  // beacon (L3 popup + countdown) and strategist/Mission (L5) both fall through
  // to the Groq composer in the route. The beacon UI calls dispatch to decide
  // the auto-pick (queue head vs composed vs canned) when countdown fires.
  // strategist mode forces the composed path for full autonomy.
  if (mode === "beacon" || mode === "strategist") {
    return null;
  }

  return null;
}
