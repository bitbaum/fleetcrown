"use client";

import { useState, useEffect, useCallback } from "react";

export function useAutoContinue(tab: string) {
  const key = `control:auto-continue:${tab.toLowerCase()}`;

  // Start false — same SSR-safety pattern as usePromptQueue.
  // The lazy initializer would run on the server (window absent), return false,
  // and the first write effect would then overwrite any stored "on" with "off".
  const [initialized, setInitialized] = useState(false);
  const [enabled, setEnabled] = useState(false);

  // Read from localStorage once on mount (client-only).
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(key) === "on"); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* ignore */ }
    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Write to localStorage only after the initial read completes.
  useEffect(() => {
    if (!initialized) return;
    try { localStorage.setItem(key, enabled ? "on" : "off"); } catch { /* ignore */ }
  }, [initialized, enabled, key]);

  // Sync changes from other windows (control panel ↔ beacon popup).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      setEnabled(e.newValue === "on");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return { enabled, toggle };
}
