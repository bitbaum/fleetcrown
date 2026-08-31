"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * SSR-safe localStorage state hook. Defers hydration to a client-side effect
 * so the server-rendered default never overwrites stored values on first mount.
 * Syncs changes across windows via the `storage` event.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  serialize: (v: T) => string,
  deserialize: (raw: string) => T,
): [T, (updater: T | ((prev: T) => T)) => void] {
  const [initialized, setInitialized] = useState(false);
  const [value, setValue] = useState<T>(defaultValue);

  // Hydrate from localStorage once on mount (client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(deserialize(raw)); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      /* ignore */
    }
    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Write to localStorage only after initial hydration read.
  // Guard: skip write if the stored value already matches — prevents ping-pong
  // between windows when storage events cause each window to re-write the same value.
  useEffect(() => {
    if (!initialized) return;
    try {
      const serialized = serialize(value);
      if (localStorage.getItem(key) !== serialized) {
        localStorage.setItem(key, serialized);
      }
    } catch {
      /* ignore */
    }
  }, [initialized, value, key, serialize]);

  // Sync changes from other windows.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        setValue(e.newValue !== null ? deserialize(e.newValue) : defaultValue);
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, defaultValue, deserialize]);

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setValue(updater as Parameters<typeof setValue>[0]);
  }, []);

  return [value, set];
}
