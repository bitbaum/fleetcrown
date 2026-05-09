"use client";

import { useCallback } from "react";
import { queueKey } from "@/lib/control-storage";
import { useLocalStorageState } from "./use-local-storage-state";

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
      return item;
    } catch {
      return null;
    }
  }, [tab, setQueue]);

  const remove = useCallback((index: number) => {
    setQueue((q) => q.filter((_, i) => i !== index));
  }, [setQueue]);

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
