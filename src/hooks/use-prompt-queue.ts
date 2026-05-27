"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, putJson } from "@/lib/api/fetch";
import { queueKey } from "@/lib/control-storage";

const EMPTY: string[] = [];
const serialize = (queue: string[]) => JSON.stringify(queue);
type QueueResult = { queue: string[]; exists: boolean };

/**
 * The persisted queue API is authoritative. localStorage is retained only as
 * a one-time migration/offline cache for queues created before DB persistence.
 */
export function usePromptQueue(tab: string) {
  const [queue, setQueue] = useState<string[]>(EMPTY);
  const queueRef = useRef<string[]>(EMPTY);
  const pendingWritesRef = useRef(0);

  const applyQueue = useCallback((next: string[]) => {
    queueRef.current = next;
    setQueue(next);
    try { localStorage.setItem(queueKey(tab), serialize(next)); } catch { /* cache only */ }
  }, [tab]);

  const persistQueue = useCallback((next: string[]) => {
    applyQueue(next);
    pendingWritesRef.current += 1;
    putJson(`/api/beacon/queue/${encodeURIComponent(tab)}`, { queue: next })
      .catch(() => {})
      .finally(() => { pendingWritesRef.current -= 1; });
  }, [applyQueue, tab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getJson<QueueResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (cancelled) return;
        if (result.exists) {
          applyQueue(result.queue);
          return;
        }
        // Migrate a pre-DB browser queue once when no server row exists.
        const cached = localStorage.getItem(queueKey(tab));
        const migrated = cached ? JSON.parse(cached) as string[] : [];
        if (migrated.length > 0) persistQueue(migrated.filter((item) => typeof item === "string"));
        else applyQueue(EMPTY);
      } catch { /* retain current cache-free state when unavailable */ }
    })();
    return () => { cancelled = true; };
  }, [applyQueue, persistQueue, tab]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await getJson<QueueResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (!result.exists) return;
        if (pendingWritesRef.current > 0) return;
        const json = serialize(result.queue);
        if (json === serialize(queueRef.current)) return;
        applyQueue(result.queue);
      } catch { /* best effort synchronization */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [applyQueue, tab]);

  const enqueue = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    persistQueue([...queueRef.current, trimmed]);
  }, [persistQueue]);

  const remove = useCallback((index: number) => {
    persistQueue(queueRef.current.filter((_, itemIndex) => itemIndex !== index));
  }, [persistQueue]);

  const reorder = useCallback((from: number, to: number) => {
    const current = queueRef.current;
    if (from < 0 || to < 0 || from >= current.length || to >= current.length) return;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    persistQueue(next);
  }, [persistQueue]);

  const edit = useCallback((index: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || index < 0 || index >= queueRef.current.length) return;
    persistQueue(queueRef.current.map((item, itemIndex) => itemIndex === index ? trimmed : item));
  }, [persistQueue]);

  const mergeItems = useCallback((indices: number[]) => {
    const sorted = [...indices].sort((a, b) => a - b);
    const current = queueRef.current;
    if (sorted.length < 2 || sorted.some((index) => index < 0 || index >= current.length)) return;
    const merged = sorted.map((index) => current[index]).join("\n\n");
    const next = current.filter((_, index) => !sorted.includes(index));
    next.splice(sorted[0], 0, merged);
    persistQueue(next);
  }, [persistQueue]);

  const clear = useCallback(() => persistQueue(EMPTY), [persistQueue]);

  return { queue, enqueue, remove, reorder, edit, mergeItems, clear };
}
