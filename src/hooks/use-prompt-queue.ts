"use client";

import { useCallback, useEffect, useRef } from "react";
import { getJson, putJson } from "@/lib/api/fetch";
import { queueKey } from "@/lib/control-storage";
import { useLocalStorageState } from "./use-local-storage-state";

function syncQueueToFile(tab: string, queue: string[]): void {
  putJson(`/api/beacon/queue/${encodeURIComponent(tab)}`, { queue }).catch(() => {/* best-effort */});
}

type QueueFileResult = { queue: string[]; exists: boolean };

const EMPTY: string[] = [];
const serialize = (v: string[]) => JSON.stringify(v);
const deserialize = (raw: string) => JSON.parse(raw) as string[];

export function usePromptQueue(tab: string) {
  const [queue, setQueue] = useLocalStorageState(
    queueKey(tab),
    EMPTY,
    serialize,
    deserialize,
  );

  // fromPollRef: true while setQueue is being called from the file poll.
  // The sync-to-file effect checks this so poll-driven updates don't echo back to the file
  // (which would reset lastWriteRef and blind the poll for another 2 s).
  const fromPollRef = useRef(false);
  const lastWriteRef = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (fromPollRef.current) { fromPollRef.current = false; return; }
    lastWriteRef.current = Date.now();
    syncQueueToFile(tab, queue);
  }, [queue, tab]);

  // On mount: bootstrap the file from localStorage if the file doesn't exist (e.g. after reboot).
  // Without this, the first poll returns exists=false and the poll skips — but we also need to
  // ensure the file is written so PyQt can see the queue on its next poll cycle.
  useEffect(() => {
    (async () => {
      try {
        const { queue: fileQueue, exists } = await getJson<QueueFileResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (exists) {
          // File exists — treat it as authoritative (may have PyQt-written items).
          setQueue((current) => {
            if (JSON.stringify(fileQueue) === JSON.stringify(current)) return current;
            fromPollRef.current = true;
            return fileQueue;
          });
        } else {
          // File missing (reboot / fresh /tmp). Write localStorage queue to file so PyQt sees it.
          const raw = localStorage.getItem(queueKey(tab));
          if (raw) {
            const local = JSON.parse(raw) as string[];
            if (local.length > 0) syncQueueToFile(tab, local);
          }
        }
      } catch { /* best-effort */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Poll the file every 2 s so PyQt changes (shift/enqueue) propagate back to the web app.
  // Skips the 2 s window after our own writes to avoid a read-back loop.
  // Skips when file doesn't exist (exists=false) to avoid wiping localStorage after reboot.
  useEffect(() => {
    const t = setInterval(async () => {
      if (Date.now() - lastWriteRef.current < 2000) return;
      try {
        const { queue: fileQueue, exists } = await getJson<QueueFileResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (!exists) return; // file absent — don't overwrite localStorage with empty array
        setQueue((current) => {
          if (JSON.stringify(fileQueue) === JSON.stringify(current)) return current;
          fromPollRef.current = true;
          return fileQueue;
        });
      } catch { /* best-effort */ }
    }, 2000);
    return () => clearInterval(t);
  }, [tab, setQueue]);

  const enqueue = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (trimmed) setQueue((q) => [...q, trimmed]);
  }, [setQueue]);

  // Removes and returns the first item synchronously.
  // Reads localStorage directly because React state updater closures run during the
  // next render phase — assigning out of setQueue(fn) always yields null at the call site.
  const shift = useCallback((): string | null => {
    try {
      const raw = localStorage.getItem(queueKey(tab));
      if (!raw) return null;
      const q = JSON.parse(raw) as string[];
      if (!q.length) return null;
      const item = q[0];
      const next = q.slice(1);
      localStorage.setItem(queueKey(tab), JSON.stringify(next));
      setQueue(next);
      syncQueueToFile(tab, next);
      return item;
    } catch {
      return null;
    }
  }, [tab, setQueue]);

  const remove = useCallback((index: number) => {
    // Sync to file immediately so the PUT fetch starts before the next render cycle.
    // Without this, pages that close shortly after remove() (e.g. beacon auto-fire) can
    // close before the React effect-based sync ever fires.
    try {
      const raw = localStorage.getItem(queueKey(tab));
      if (raw) syncQueueToFile(tab, (JSON.parse(raw) as string[]).filter((_, i) => i !== index));
    } catch { /* ignore */ }
    setQueue((q) => q.filter((_, i) => i !== index));
  }, [setQueue, tab]);

  const reorder = useCallback((from: number, to: number) => {
    setQueue((q) => {
      if (from < 0 || to < 0 || from >= q.length || to >= q.length) return q;
      const next = [...q];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, [setQueue]);

  const edit = useCallback((index: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQueue((q) => q.map((item, i) => (i === index ? trimmed : item)));
  }, [setQueue]);

  const clear = useCallback(() => setQueue(EMPTY), [setQueue]);

  return { queue, enqueue, shift, remove, reorder, edit, clear };
}
