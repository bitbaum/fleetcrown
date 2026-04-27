// Time windows (seconds) for control-panel state detection.
// Must be kept in sync with the /tmp sentinel file TTLs in the bash hooks.
export const READY_WINDOW_S   = 600;   // 10 min
export const CLOSED_WINDOW_S  = 3600;  // 1 hour
export const CLOSING_WINDOW_S = 1800;  // 30 min
export const AUTO_INJECT_S    = 12;    // countdown before auto-inject on ready

export const HEALTH_COLOR: Record<string, string> = {
  good:      "text-emerald-400",
  degraded:  "text-amber-400",
  critical:  "text-red-400",
  excellent: "text-emerald-300",
};

export const PROMPT_STYLE: Record<string, string> = {
  primary: "bg-indigo-600 hover:bg-indigo-500 text-white",
  action:  "bg-white/10 hover:bg-white/15 text-white/90",
  more:    "bg-white/5 hover:bg-white/10 text-white/70",
};
