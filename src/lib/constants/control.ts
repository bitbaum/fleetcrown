// Time windows (seconds) for control-panel state detection.
// Must be kept in sync with the /tmp sentinel file TTLs in the bash hooks.
export const READY_WINDOW_S   = 600;   // 10 min
export const CLOSED_WINDOW_S  = 3600;  // 1 hour
export const CLOSING_WINDOW_S = 1800;  // 30 min
export const AUTO_INJECT_S    = 12;    // countdown before auto-inject on ready

export const HEALTH_COLOR: Record<string, string> = {
  good:      "text-status-positive",
  degraded:  "text-status-warning",
  critical:  "text-status-negative",
  excellent: "text-status-positive",
};

export const PROMPT_STYLE: Record<string, string> = {
  primary: "rounded-2xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverted hover:bg-accent-hover",
  action:  "rounded-2xl border border-border-default bg-surface-overlay px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-raised",
  more:    "rounded-2xl border border-border-subtle bg-surface-base px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary",
};
