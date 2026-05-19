// UI banner display windows — how long each state banner stays visible after detection.
// Must be kept in sync with the /tmp sentinel file TTLs in the bash hooks.
export const READY_WINDOW_S   = 600;    // 10 min — "Agent finished" banner
export const CLOSED_WINDOW_S  = 3600;   // 1 hour — "Session closed" banner
export const CLOSING_WINDOW_S = 1800;   // 30 min — "Closing session…" banner
export const AUTO_INJECT_S              = 12;  // countdown before auto-inject in control panel (matches Python COUNTDOWN_SECONDS)
export const DEFAULT_BEACON_COUNTDOWN_S  = 12;  // fallback when settings file is absent — must match Python COUNTDOWN_SECONDS
export const MIN_BEACON_COUNTDOWN_S      = 5;   // shortest allowed beacon countdown
export const MAX_BEACON_COUNTDOWN_S      = 300; // longest allowed beacon countdown (5 minutes)
export const DEFAULT_BEACON_MIN_IDLE_S   = 0;   // 0 = always show popup regardless of keyboard activity
export const MAX_BEACON_MIN_IDLE_S       = 600; // 10 minutes max
export const DEFAULT_POPUP_MODE          = "both"; // "both" | "web" | "pyqt" | "disabled"

// Fleet query windows — used by getFleetSummary (today.ts) to classify agent states from DB only.
// PROMPT_RUNNING_WINDOW_S: a started prompt older than this is considered stale (crashed without cleanup).
// Uses READY_WINDOW_S for the "waiting" cutoff so both the UI banner and the summary pill agree.
export const PROMPT_RUNNING_WINDOW_S = 14400; // 4 hours

// How long a sentinel file or DB event remains valid as a source of lifecycle state.
// Intentionally much larger than the UI display windows so DB state can survive a banner dismiss.
export const SENTINEL_VALIDITY_S = 86400; // 24 hours

/** Returns true when a unix-seconds timestamp is non-null and falls within the given window. */
export function withinWindow(ts: number | null, nowS: number, windowS: number): boolean {
  return ts !== null && nowS - ts < windowS;
}

/** Wire-format prefix used in beacon choice handshake: "custom:<prompt text>" */
export const CUSTOM_CHOICE_PREFIX = "custom:";

/** Wire-format prefix used to request an agent switch: "switch:<agent-id>" */
export const SWITCH_CHOICE_PREFIX = "switch:";

/** Extract the short health label from verbose agent output like "GOOD — deployed; all tests pass" */
export function getHealthShort(health: string): string {
  return health.split(/\s*[,—–]\s*/)[0].trim().toLowerCase();
}

/** Returns true for health short-labels that represent a problem needing attention. */
export function isHealthPoor(short: string): boolean {
  return short === "degraded" || short === "critical";
}

export const HEALTH_COLOR: Record<string, string> = {
  good:              "text-status-positive",
  excellent:         "text-status-positive",
  "needs attention": "text-status-warning",
  degraded:          "text-status-warning",
  critical:          "text-status-negative",
};

// Maps the AgentPrompt.style field → Tailwind class for consistent chip rendering.
// Used by ReadyBanner (control panel) and the beacon popup — single SSOT for chip appearance.
// Note: the beacon's action chips and the control panel's orchestration buttons (control-intents.ts)
// are intentionally separate systems: beacon injects text into Claude; orchestration dispatches
// a workflow via API. Their keys overlap but their execution paths differ.
export const PROMPT_STYLE: Record<string, string> = {
  primary: "ui-btn-ready-primary",
  action:  "ui-btn-ready-action",
  more:    "ui-btn-ready-more",
};
