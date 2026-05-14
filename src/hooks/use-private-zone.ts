"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "pz_unlocked";
const TTL_MS = 30 * 60 * 1000;

type StoredState = { expiresAt: number };

function readStorage(): boolean {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const { expiresAt } = JSON.parse(raw) as StoredState;
    return Date.now() < expiresAt;
  } catch {
    return false;
  }
}

function writeStorage() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ expiresAt: Date.now() + TTL_MS }));
  } catch {}
}

function clearStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Module-level listener set so unlock/lock triggers re-render across all consumers.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify() {
  listeners.forEach((l) => l());
}

export function usePrivateZone() {
  // useSyncExternalStore: server snapshot → false (always locked server-side).
  // Client snapshot reads sessionStorage synchronously — no useEffect needed.
  const unlocked = useSyncExternalStore(subscribe, readStorage, () => false);

  const unlock = useCallback(() => {
    writeStorage();
    notify();
  }, []);

  const lock = useCallback(() => {
    clearStorage();
    notify();
  }, []);

  return { unlocked, checking: false, unlock, lock };
}
