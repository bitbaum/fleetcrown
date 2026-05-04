// Time windows (seconds) for control-panel state detection.
// Must be kept in sync with the /tmp sentinel file TTLs in the bash hooks.
export const READY_WINDOW_S   = 600;   // 10 min
export const CLOSED_WINDOW_S  = 3600;  // 1 hour
export const CLOSING_WINDOW_S = 1800;  // 30 min
export const AUTO_INJECT_S    = 12;    // countdown before auto-inject on ready

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
