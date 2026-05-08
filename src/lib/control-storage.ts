export const autoContinueKey = (tab: string) =>
  `control:auto-continue:${tab.toLowerCase()}`;

export const queueKey = (tab: string) =>
  `control:queue:${tab.toLowerCase()}`;

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
