"use client";

import { useCallback, useEffect } from "react";
import { SLEEP_MODE_KEY } from "@/lib/control-storage";
import { postJson } from "@/lib/api/fetch";
import { useLocalStorageState } from "./use-local-storage-state";

const serialize = (v: boolean) => (v ? "on" : "off");
const deserialize = (raw: string) => raw === "on";

/**
 * Global "go to bed" toggle — when on, ready banners auto-inject with no
 * countdown so the outcome-tracking loop runs while the user is away.
 * Auto-exits on the next pointer/keyboard activity inside this window, so
 * touching the keyboard always restores normal-confirm behavior immediately.
 */
export function useSleepMode() {
  const [enabled, setEnabled] = useLocalStorageState(
    SLEEP_MODE_KEY,
    false,
    serialize,
    deserialize,
  );

  const setAndSync = useCallback((next: boolean) => {
    setEnabled(next);
    // Daemon-readable sentinel — agent-hook-bridge.sh can read this to skip the
    // beacon popup entirely while sleep mode is on (follow-up; the web-app path
    // already shortcircuits the countdown).
    postJson("/api/control/sleep-mode", { enabled: next }).catch(() => {});
  }, [setEnabled]);

  const toggle = useCallback(() => setAndSync(!enabled), [enabled, setAndSync]);

  // Auto-exit on user activity. Single-shot listeners armed only while sleep is on.
  useEffect(() => {
    if (!enabled) return;
    const exit = () => setAndSync(false);
    window.addEventListener("keydown",     exit, { once: true });
    window.addEventListener("pointerdown", exit, { once: true });
    return () => {
      window.removeEventListener("keydown",     exit);
      window.removeEventListener("pointerdown", exit);
    };
  }, [enabled, setAndSync]);

  return { enabled, toggle, setEnabled: setAndSync };
}
