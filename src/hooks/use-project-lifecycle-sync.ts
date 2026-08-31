import { useEffect, useRef } from "react";
import { readyAtKey } from "@/lib/control-storage";

/**
 * Syncs project ready state to local storage and /tmp sentinels.
 * Ensures the beacon popup and web dashboard stay in sync.
 */
export function useProjectLifecycleSync(tab: string, isReady: boolean) {
  const prevIsReadyRef = useRef(false);

  useEffect(() => {
    if (isReady && !prevIsReadyRef.current) {
      // New ready cycle: mark the start time for the countdown
      try {
        localStorage.setItem(readyAtKey(tab), Date.now().toString());
      } catch {
        // Ignore storage errors
      }
    } else if (!isReady && prevIsReadyRef.current) {
      // Session resumed or closed: clear the ready timestamp
      try {
        localStorage.removeItem(readyAtKey(tab));
      } catch {
        // Ignore storage errors
      }
    }
    prevIsReadyRef.current = isReady;
  }, [isReady, tab]);
}
