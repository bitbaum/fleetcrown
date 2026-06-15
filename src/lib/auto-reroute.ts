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
  | "no-capacity-issue"   // nothing to react to
  | "autopilot-off"       // user owns this project — surface, don't act
  | "switch-in-flight"    // a switch is already running; wait for it to land
  | "tab-closed"          // no live workspace to switch inside of
  | "no-fallback"         // no other installed agent to switch to
  | "all-tried";          // every alternative already auto-attempted this episode

export type AutoRerouteDecision =
  | { reroute: true; toAgent: string }
  | { reroute: false; reason: AutoRerouteSkipReason };

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
  if (input.triedAgents.has(input.suggestedFallback)) return { reroute: false, reason: "all-tried" };
  return { reroute: true, toAgent: input.suggestedFallback };
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
  return lastDecisionReason === "all-tried" || lastDecisionReason === "no-fallback";
}
