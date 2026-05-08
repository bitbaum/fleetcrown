"use client";

import { useState, useEffect, useCallback } from "react";

export function usePromptQueue(tab: string) {
  const key = `control:queue:${tab.toLowerCase()}`;

  // Start empty — lazy initializer would run on the server (where window is absent)
  // and the SSR'd [] would then overwrite localStorage on the first client effect.
  // Instead, we hydrate from localStorage in a useEffect (client-only).
  const [initialized, setInitialized] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);

  // Read from localStorage once on mount (client-only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      setQueue(raw ? (JSON.parse(raw) as string[]) : []); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* ignore */ }
    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Write to localStorage only after the initial hydration read, so we never
  // overwrite stored items with the pre-hydration empty state.
  useEffect(() => {
    if (!initialized) return;
    try { window.localStorage.setItem(key, JSON.stringify(queue)); } catch { /* ignore */ }
  }, [initialized, queue, key]);

  // React to queue changes made by other windows (e.g. beacon popup).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        setQueue(e.newValue ? (JSON.parse(e.newValue) as string[]) : []);
      } catch { /* ignore malformed */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const enqueue = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (trimmed) setQueue((q) => [...q, trimmed]);
  }, []);

  // Removes and returns the first item. Returns null if empty.
  const shift = useCallback((): string | null => {
    let item: string | null = null;
    setQueue((q) => {
      if (q.length === 0) return q;
      item = q[0];
      return q.slice(1);
    });
    return item;
  }, []);

  const remove = useCallback((index: number) => {
    setQueue((q) => q.filter((_, i) => i !== index));
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setQueue((q) => {
      if (from < 0 || to < 0 || from >= q.length || to >= q.length) return q;
      const next = [...q];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const edit = useCallback((index: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQueue((q) => q.map((item, i) => (i === index ? trimmed : item)));
  }, []);

  const clear = useCallback(() => setQueue([]), []);

  return { queue, enqueue, shift, remove, reorder, edit, clear };
}
