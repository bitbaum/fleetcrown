export const autoContinueKey = (tab: string) =>
  `control:auto-continue:${tab.toLowerCase()}`;

export const queueKey = (tab: string) =>
  `control:queue:${tab.toLowerCase()}`;

// Written when the agent enters the "ready" state — both the control panel card
// and any open beacon popup initialise their countdown from this shared origin
// so both views show the same remaining seconds.
export const readyAtKey = (tab: string) =>
  `control:ready-at:${tab.toLowerCase()}`;

// Written by the beacon popup while the user is composing (mic active, typing, focused).
// The control panel reads this synchronously before auto-injecting so it never fires
// while the user is mid-sentence — even though the two live in different browser windows.
export const beaconComposingKey = (tab: string) =>
  `control:beacon-composing:${tab.toLowerCase()}`;

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

// Global sleep mode — when "on", every ready banner auto-injects immediately
// (no countdown) so the user can walk away and have the outcome-tracking loop
// run on its own. Persisted in localStorage so the toggle survives reloads;
// synced to a /tmp sentinel so the daemon can skip popup launching too.
export const SLEEP_MODE_KEY = "control:sleep-mode";

export const isSleepModeEnabledSync = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SLEEP_MODE_KEY) === "on";
  } catch {
    return false;
  }
};
