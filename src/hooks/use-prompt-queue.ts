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
 *
 * Reads come from the SSE control stream (see useControlData / FastProjectState):
 * pass `initialQueue` + `initialRevision` from props sourced by the streamed
 * project state. The hook only falls back to a one-shot HTTP GET when those
 * props are absent (local /proc-backed runtime where the DB-projected stream
 * path doesn't include queue data). Per-card polling is gone.
 */
export function usePromptQueue(tab: string, initialQueue?: string[], initialRevision?: number) {
  const [queue, setQueue] = useState<string[]>(initialQueue ?? EMPTY);
  const queueRef = useRef<string[]>(initialQueue ?? EMPTY);
  const serverQueueRef = useRef<string[]>(initialQueue ?? EMPTY);
  const revisionRef = useRef(initialRevision ?? 0);
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

  // Initial load: skip the HTTP GET when the streamed control state already
  // provided a queue + revision. Only the local /proc-backed runtime omits
  // those (the DB-projected stream path on Vercel always includes them).
  useEffect(() => {
    if (initialQueue !== undefined && initialRevision !== undefined) {
      serverQueueRef.current = initialQueue;
      revisionRef.current = initialRevision;
      if (pendingWritesRef.current === 0) applyQueue(initialQueue);
      initialLoadRef.current = Promise.resolve();
      return;
    }
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
    // initialQueue/initialRevision intentionally excluded from deps — initial
    // load is one-shot; subsequent prop changes are handled by the sync effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyQueue, persistMutation, tab]);

  // Live sync: when the SSE control stream pushes a new queue revision for
  // this tab, adopt it unless we have a pending optimistic write. Replaces
  // the per-card 2 s polling loop.
  useEffect(() => {
    if (initialQueue === undefined || initialRevision === undefined) return;
    if (pendingWritesRef.current > 0) return;
    if (initialRevision === revisionRef.current) return;
    serverQueueRef.current = initialQueue;
    revisionRef.current = initialRevision;
    if (serialize(initialQueue) !== serialize(queueRef.current)) applyQueue(initialQueue);
  }, [initialQueue, initialRevision, applyQueue]);

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
