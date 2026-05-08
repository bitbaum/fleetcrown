export const autoContinueKey = (tab: string) =>
  `control:auto-continue:${tab.toLowerCase()}`;

export const queueKey = (tab: string) =>
  `control:queue:${tab.toLowerCase()}`;

// Written when the agent enters the "ready" state — both the control panel card
// and any open beacon popup initialise their countdown from this shared origin
// so both views show the same remaining seconds.
export const readyAtKey = (tab: string) =>
  `control:ready-at:${tab.toLowerCase()}`;

// Synchronous read — safe to call at injection time to bypass stale React state.
// Returns true (enabled) when no value is stored (default ON).
export const isAutoContinueEnabledSync = (tab: string): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(autoContinueKey(tab)) !== "off";
  } catch {
    return true;
  }
};
