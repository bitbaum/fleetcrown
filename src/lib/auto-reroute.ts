/**
 * Auto-reroute decision — client-safe, no Node/fs imports.
 *
 * Closes the loop from "we can resolve a fallback agent" to "we reroute live."
 * When an agent hits a capacity / rate-limit wall (see detectCapacityIssue-
 * FromProject) the control surface already computes the next fallback agent
 * (resolveNextFallbackAgent). Until now a human had to click "Switch". Under
 * autopilot that click is mechanical — exactly the kind of judgment-free step
 * a fleet should take itself (Ground Truth #4).
 *
 * This function is the single source of truth for WHETHER to auto-switch.
 * It is pure so the policy is testable in isolation (scripts/test/auto-reroute)
 * and so the same decision can later be reused server-side (the headless
 * beacon path) without dragging React state along.
 *
 * Loop safety is the whole point: AGENT_FALLBACK_ORDER cycles
 * (grok → claude), so a naive "switch to next on every capacity signal" spins
 * forever once every agent is exhausted. The caller tracks which agents have
 * already been auto-attempted in the CURRENT capacity episode and passes them
 * in; once the resolver would re-suggest one we've tried, we stop and hand
 * back to the human instead of churning.
 */

export type AutoRerouteSkipReason =
  | "no-capacity-issue" // nothing to react to
  | "autopilot-off" // user owns this project — surface, don't act
  | "switch-in-flight" // a switch is already running; wait for it to land
  | "tab-closed" // no live workspace to switch inside of
  | "no-fallback" // no other installed agent to switch to
  | "all-tried"; // every alternative already auto-attempted this episode

export type AutoRerouteDecision =
  { reroute: true; toAgent: string } | { reroute: false; reason: AutoRerouteSkipReason };

export type AutoRerouteInput = {
  /** Capacity/rate-limit language detected in the project's session fields. */
  capacityIssue: boolean;
  /** Effective autopilot for THIS project (override ?? global) is "on". */
  automationOn: boolean;
  /** A live workspace tab exists to switch inside of. */
  tabOpen: boolean;
  /** A switch command is already running for this project. */
  switchInFlight: boolean;
  /** Next installed fallback agent, or null if none (resolveNextFallbackAgent). */
  suggestedFallback: string | null;
  /** Agents already auto-attempted in the current capacity episode. */
  triedAgents: ReadonlySet<string>;
};

/**
 * Decide whether to auto-switch agents in response to a capacity issue.
 * Order matters: cheapest / most-common skips first, the act last.
 */
export function decideAutoReroute(input: AutoRerouteInput): AutoRerouteDecision {
  if (!input.capacityIssue) return { reroute: false, reason: "no-capacity-issue" };
  if (!input.automationOn) return { reroute: false, reason: "autopilot-off" };
  if (input.switchInFlight) return { reroute: false, reason: "switch-in-flight" };
  if (!input.tabOpen) return { reroute: false, reason: "tab-closed" };
  if (!input.suggestedFallback) return { reroute: false, reason: "no-fallback" };
  if (input.triedAgents.has(input.suggestedFallback))
    return { reroute: false, reason: "all-tried" };
  return { reroute: true, toAgent: input.suggestedFallback };
}

// ── Headless (server-side) reroute ──────────────────────────────────────────
// The /control path above only fires while a browser has the page open. The
// beacon path runs server-side when an agent's session ends, so it can reroute
// with no one watching — the real fleet-operation win. It can't lean on a
// React ref for loop tracking, so loop safety comes from a DB guard instead:
// a cap on auto-switches per project per time window (one full fallback cycle,
// then stop) plus "don't pile on while a switch is still unclaimed."

/** Max auto-switches enqueued per project per window. AGENT_FALLBACK_ORDER has
 *  5 agents, so ≤4 hops covers one full cycle from any start; after that we
 *  stop rather than cycle back to an already-exhausted agent. */
export const MAX_AUTO_REROUTES_PER_WINDOW = 4;

export type HeadlessRerouteSkipReason =
  | "no-capacity-issue"
  | "autopilot-off"
  | "no-fallback" // resolveNextAvailableAgent found no installed alternative
  | "no-dir" // project has no local dir to switch inside of
  | "switch-pending" // an unclaimed switch is already queued for this project
  | "window-exhausted"; // hit the per-window cap → surface, don't churn

export type HeadlessRerouteDecision =
  { reroute: true; toAgent: string } | { reroute: false; reason: HeadlessRerouteSkipReason };

export type HeadlessRerouteInput = {
  capacityIssue: boolean;
  automationOn: boolean;
  nextAgent: string | null;
  hasDir: boolean;
  hasPendingSwitch: boolean;
  recentSwitchCount: number;
  maxSwitchesPerWindow: number;
};

/** Server-side counterpart of decideAutoReroute. Pure for the same reason. */
export function decideHeadlessReroute(input: HeadlessRerouteInput): HeadlessRerouteDecision {
  if (!input.capacityIssue) return { reroute: false, reason: "no-capacity-issue" };
  if (!input.automationOn) return { reroute: false, reason: "autopilot-off" };
  if (!input.nextAgent) return { reroute: false, reason: "no-fallback" };
  if (!input.hasDir) return { reroute: false, reason: "no-dir" };
  if (input.hasPendingSwitch) return { reroute: false, reason: "switch-pending" };
  if (input.recentSwitchCount >= input.maxSwitchesPerWindow) {
    return { reroute: false, reason: "window-exhausted" };
  }
  return { reroute: true, toAgent: input.nextAgent };
}

/**
 * Whether the human-facing capacity banner should still be shown.
 * Autopilot handles it silently UNLESS it can't (exhausted fallbacks / no
 * installed alternative) — then we surface so a human can intervene. With
 * autopilot off, the manual banner is the only path, so always show it.
 */
export function shouldShowManualCapacityBanner(
  automationOn: boolean,
  lastDecisionReason: AutoRerouteSkipReason | null,
): boolean {
  if (!automationOn) return true;
  // Under autopilot, surface to the human whenever autopilot CANNOT act on its
  // own — every fallback already tried, no installed fallback, or no live
  // tab/agent to switch inside (a not-running project that hit a capacity wall;
  // clicking Switch still persists the agent preference for the next launch).
  // When autopilot CAN act, autoRerouteHandling renders the auto banner instead.
  // A capacity wall must never be silently invisible.
  return (
    lastDecisionReason === "all-tried" ||
    lastDecisionReason === "no-fallback" ||
    lastDecisionReason === "tab-closed"
  );
}
