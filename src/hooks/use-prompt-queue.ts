"use client";

import { useCallback, useEffect, useRef } from "react";
import { getJson, putJson } from "@/lib/api/fetch";
import { queueKey } from "@/lib/control-storage";
import { useLocalStorageState } from "./use-local-storage-state";

const EMPTY: string[] = [];
const serialize = (v: string[]) => JSON.stringify(v);
const deserialize = (raw: string) => JSON.parse(raw) as string[];

function toJson(q: string[]): string { return JSON.stringify(q); }

// Writes queue to the file and records what we wrote.
// Callers MUST update lastWrittenRef.current before calling setQueue, so the sync
// effect sees the expected content and skips the redundant write.
function writeToFile(tab: string, queue: string[], lastWrittenRef: React.MutableRefObject<string>): void {
  lastWrittenRef.current = toJson(queue);
  putJson(`/api/beacon/queue/${encodeURIComponent(tab)}`, { queue }).catch(() => {});
}

type QueueFileResult = { queue: string[]; exists: boolean };

export function usePromptQueue(tab: string) {
  const [queue, setQueue] = useLocalStorageState(queueKey(tab), EMPTY, serialize, deserialize);

  // Content-based guard: tracks the last JSON string we PUT to the file.
  // Poll only applies updates when file content differs (external change from the daemon or another tab).
  // Sync effect skips writes when queue content already matches (prevents double-writes).
  const lastWrittenRef = useRef<string>(toJson(EMPTY));
  const mounted = useRef(false);

  // Sync React state → file. Skips if we already wrote this exact content.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const json = toJson(queue);
    if (json === lastWrittenRef.current) return;
    writeToFile(tab, queue, lastWrittenRef);
  }, [queue, tab]);

  // On mount: reconcile with file. File wins (may have daemon- or hook-written items).
  // If file is absent (reboot), push localStorage queue to file so the daemon sees it.
  useEffect(() => {
    (async () => {
      try {
        const { queue: fileQueue, exists } = await getJson<QueueFileResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (exists) {
          const fileJson = toJson(fileQueue);
          lastWrittenRef.current = fileJson;
          setQueue((current) => {
            if (fileJson === toJson(current)) return current;
            return fileQueue;
          });
        } else {
          const raw = localStorage.getItem(queueKey(tab));
          if (raw) {
            const local = JSON.parse(raw) as string[];
            if (local.length > 0) writeToFile(tab, local, lastWrittenRef);
          }
        }
      } catch { /* best-effort */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Poll file every 2s for external changes (daemon/hook shifts/enqueues).
  // Skips silently when file content matches what we last wrote (our own echo).
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const { queue: fileQueue, exists } = await getJson<QueueFileResult>(`/api/beacon/queue/${encodeURIComponent(tab)}`);
        if (!exists) return;
        const fileJson = toJson(fileQueue);
        if (fileJson === lastWrittenRef.current) return; // our own write — ignore
        lastWrittenRef.current = fileJson;
        setQueue((current) => {
          if (fileJson === toJson(current)) return current;
          return fileQueue;
        });
      } catch { /* best-effort */ }
    }, 2000);
    return () => clearInterval(t);
  }, [tab, setQueue]);

  const enqueue = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    try {
      const raw = localStorage.getItem(queueKey(tab));
      const q = raw ? (JSON.parse(raw) as string[]) : [];
      writeToFile(tab, [...q, trimmed], lastWrittenRef);
    } catch { /* ignore */ }
    setQueue((q) => [...q, trimmed]);
  }, [setQueue, tab]);

  // Reads localStorage directly to get the definitive current value without
  // a render cycle, then writes the post-shift state atomically.
  const shift = useCallback((): string | null => {
    try {
      const raw = localStorage.getItem(queueKey(tab));
      if (!raw) return null;
      const q = JSON.parse(raw) as string[];
      if (!q.length) return null;
      const item = q[0];
      const next = q.slice(1);
      localStorage.setItem(queueKey(tab), toJson(next));
      writeToFile(tab, next, lastWrittenRef);
      setQueue(next);
      return item;
    } catch { return null; }
  }, [tab, setQueue]);

  // Writes the filtered queue to file immediately (critical for beacon auto-fire where
  // the tab may close before the React effect cycle runs), then updates React state.
  // State updater is kept pure (no side effects) so React Strict Mode / concurrent mode
  // double-invocation doesn't cause double file writes.
  const remove = useCallback((index: number) => {
    try {
      const raw = localStorage.getItem(queueKey(tab));
      if (raw) {
        const next = (JSON.parse(raw) as string[]).filter((_, i) => i !== index);
        writeToFile(tab, next, lastWrittenRef); // sets lastWrittenRef → sync effect skips
      }
    } catch { /* ignore */ }
    setQueue((q) => q.filter((_, i) => i !== index));
  }, [setQueue, tab]);

  const reorder = useCallback((from: number, to: number) => {
    try {
      const raw = localStorage.getItem(queueKey(tab));
      if (raw) {
        const q = JSON.parse(raw) as string[];
        if (from >= 0 && to >= 0 && from < q.length && to < q.length) {
          const next = [...q];
          const [item] = next.splice(from, 1);
          next.splice(to, 0, item);
          writeToFile(tab, next, lastWrittenRef);
        }
      }
    } catch { /* ignore */ }
    setQueue((q) => {
      if (from < 0 || to < 0 || from >= q.length || to >= q.length) return q;
      const next = [...q];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, [setQueue, tab]);

  const edit = useCallback((index: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const raw = localStorage.getItem(queueKey(tab));
      if (raw) {
        const q = JSON.parse(raw) as string[];
        if (index >= 0 && index < q.length) {
          const next = q.map((item, i) => (i === index ? trimmed : item));
          writeToFile(tab, next, lastWrittenRef);
        }
      }
    } catch { /* ignore */ }
    setQueue((q) => q.map((item, i) => (i === index ? trimmed : item)));
  }, [setQueue, tab]);

  // Merges the items at the given (sorted) indices into a single item placed at
  // the lowest selected index. All other selected items are removed.
  const mergeItems = useCallback((indices: number[]) => {
    try {
      const raw = localStorage.getItem(queueKey(tab));
      if (raw) {
        const q = JSON.parse(raw) as string[];
        const sorted = [...indices].sort((a, b) => a - b);
        if (sorted.length >= 2 && !sorted.some(i => i < 0 || i >= q.length)) {
          const merged = sorted.map(i => q[i]).join("\n\n");
          const firstIdx = sorted[0];
          const next = q.filter((_, i) => !sorted.includes(i));
          next.splice(firstIdx, 0, merged);
          writeToFile(tab, next, lastWrittenRef);
        }
      }
    } catch { /* ignore */ }
    setQueue((q) => {
      const sorted = [...indices].sort((a, b) => a - b);
      if (sorted.length < 2 || sorted.some(i => i < 0 || i >= q.length)) return q;
      const merged = sorted.map(i => q[i]).join("\n\n");
      const firstIdx = sorted[0];
      const next = q.filter((_, i) => !sorted.includes(i));
      next.splice(firstIdx, 0, merged);
      return next;
    });
  }, [setQueue, tab]);

  const clear = useCallback(() => setQueue(EMPTY), [setQueue]);

  return { queue, enqueue, shift, remove, reorder, edit, mergeItems, clear };
}
