// UI banner display windows — how long each state banner stays visible after detection.
// Must be kept in sync with the /tmp sentinel file TTLs in the bash hooks.
export const READY_WINDOW_S   = 600;    // 10 min — "Agent finished" banner
export const CLOSED_WINDOW_S  = 3600;   // 1 hour — "Session closed" banner
export const CLOSING_WINDOW_S = 1800;   // 30 min — "Closing session…" banner
export const AUTO_INJECT_S    = 12;     // countdown before auto-inject on ready

// How long a sentinel file or DB event remains valid as a source of lifecycle state.
// Intentionally much larger than the UI display windows so DB state can survive a banner dismiss.
export const SENTINEL_VALIDITY_S = 86400; // 24 hours

/** Returns true when a unix-seconds timestamp is non-null and falls within the given window. */
export function withinWindow(ts: number | null, nowS: number, windowS: number): boolean {
  return ts !== null && nowS - ts < windowS;
}

export const HEALTH_COLOR: Record<string, string> = {
  good:      "text-status-positive",
  degraded:  "text-status-warning",
  critical:  "text-status-negative",
  excellent: "text-status-positive",
};

export const PROMPT_STYLE: Record<string, string> = {
  primary: "ui-btn-ready-primary",
  action:  "ui-btn-ready-action",
  more:    "ui-btn-ready-more",
};
