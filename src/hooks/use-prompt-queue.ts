"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, putJson } from "@/lib/api/fetch";
import { queueKey } from "@/lib/control-storage";

const EMPTY: string[] = [];
const serialize = (queue: string[]) => JSON.stringify(queue);
type QueueResult = { queue: string[]; revision: number; exists: boolean };
type QueueMutation = (queue: string[]) => string[];

/**
 * The database queue is authoritative. Mutations are serialized per client
 * and retried against the latest revision so concurrent browser/runtime edits
 * do not silently replace one another.
 */
export function usePromptQueue(tab: string) {
  const [queue, setQueue] = useState<string[]>(EMPTY);
  const queueRef = useRef<string[]>(EMPTY);
  const serverQueueRef = useRef<string[]>(EMPTY);
  const revisionRef = useRef(0);
  const pendingWritesRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const initialLoadRef = useRef<Promise<void>>(Promise.resolve());

  const applyQueue = useCallback((next: string[]) => {
    queueRef.current = next;
    setQueue(next);
    try { localStorage.setItem(queueKey(tab), serialize(next)); } catch { /* cache only */ }
  }, [tab]);

  const persistMutation = useCallback((mutation: QueueMutation) => {
    applyQueue(mutation(queueRef.current));
    pendingWritesRef.current += 1;

    writeChainRef.current = writeChainRef.current
      .then(() => initialLoadRef.current)
      .then(async () => {
        let base = serverQueueRef.current;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const next = mutation(base);
          const response = await putJson(`/api/beacon/queue/${encodeURIComponent(tab)}`, {
            queue: next,
            expectedRevision: revisionRef.current,
          });
          const result = await response.json() as QueueResult;
          if (response.ok) {
            serverQueueRef.current = next;
            revisionRef.current = result.revision;
            return;
          }
          if (response.status !== 409) throw new Error(`queue write failed: ${response.status}`);
          base = result.queue;
          serverQueueRef.current = result.queue;
          revisionRef.current = result.revision;
        }
        throw new Error("queue write repeatedly conflicted");
      })
      .catch(async () => {
        try {
          const result = await getJson<QueueResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
          serverQueueRef.current = result.queue;
          revisionRef.current = result.revision;
        } catch { /* retain optimistic queue while server is unavailable */ }
      })
      .finally(() => {
        pendingWritesRef.current -= 1;
        if (pendingWritesRef.current === 0) applyQueue(serverQueueRef.current);
      });
  }, [applyQueue, tab]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getJson<QueueResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (cancelled) return;
        serverQueueRef.current = result.queue;
        revisionRef.current = result.revision;
        if (result.exists) {
          if (pendingWritesRef.current === 0) applyQueue(result.queue);
          return;
        }
        // Migrate a pre-DB browser queue once when no server row exists.
        const cached = localStorage.getItem(queueKey(tab));
        const parsed = cached ? JSON.parse(cached) as unknown : [];
        const migrated = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
        if (migrated.length > 0) persistMutation(() => migrated);
        else if (pendingWritesRef.current === 0) applyQueue(EMPTY);
      } catch { /* retain optimistic/cache-free state when unavailable */ }
    };
    initialLoadRef.current = load();
    return () => { cancelled = true; };
  }, [applyQueue, persistMutation, tab]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await getJson<QueueResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (!result.exists || pendingWritesRef.current > 0) return;
        serverQueueRef.current = result.queue;
        revisionRef.current = result.revision;
        if (serialize(result.queue) !== serialize(queueRef.current)) applyQueue(result.queue);
      } catch { /* best effort synchronization */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [applyQueue, tab]);

  const enqueue = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    persistMutation((current) => [...current, trimmed]);
  }, [persistMutation]);

  const remove = useCallback((index: number) => {
    const selected = queueRef.current[index];
    if (selected === undefined) return;
    persistMutation((current) => {
      const selectedIndex = current.indexOf(selected);
      return selectedIndex < 0 ? current : current.filter((_, itemIndex) => itemIndex !== selectedIndex);
    });
  }, [persistMutation]);

  const reorder = useCallback((from: number, to: number) => {
    if (from < 0 || to < 0 || from >= queueRef.current.length || to >= queueRef.current.length) return;
    if (from === to) return;
    const moved = queueRef.current[from];
    const anchor = queueRef.current[to];
    persistMutation((current) => {
      const movedIndex = current.indexOf(moved);
      if (movedIndex < 0) return current;
      const next = [...current];
      const [item] = next.splice(movedIndex, 1);
      const anchorIndex = next.indexOf(anchor);
      const destination = anchorIndex < 0
        ? Math.min(to, next.length)
        : from < to ? anchorIndex + 1 : anchorIndex;
      next.splice(destination, 0, item);
      return next;
    });
  }, [persistMutation]);

  const edit = useCallback((index: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || index < 0 || index >= queueRef.current.length) return;
    const selected = queueRef.current[index];
    persistMutation((current) => {
      const selectedIndex = current.indexOf(selected);
      return selectedIndex < 0 ? current : current.map((item, itemIndex) => itemIndex === selectedIndex ? trimmed : item);
    });
  }, [persistMutation]);

  const mergeItems = useCallback((indices: number[]) => {
    const sorted = [...indices].sort((a, b) => a - b);
    if (sorted.length < 2 || sorted.some((index) => index < 0 || index >= queueRef.current.length)) return;
    const selected = sorted.map((index) => queueRef.current[index]);
    persistMutation((current) => {
      const selectedIndexes: number[] = [];
      let searchFrom = 0;
      for (const item of selected) {
        const found = current.indexOf(item, searchFrom);
        if (found < 0) return current;
        selectedIndexes.push(found);
        searchFrom = found + 1;
      }
      const merged = selected.join("\n\n");
      const next = current.filter((_, index) => !selectedIndexes.includes(index));
      next.splice(selectedIndexes[0], 0, merged);
      return next;
    });
  }, [persistMutation]);

  const clear = useCallback(() => persistMutation(() => EMPTY), [persistMutation]);

  return { queue, enqueue, remove, reorder, edit, mergeItems, clear };
}
