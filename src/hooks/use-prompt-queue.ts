"use client";

import { useState, useEffect, useCallback } from "react";

export function usePromptQueue(tab: string) {
  const key = `control:queue:${tab.toLowerCase()}`;

  const [queue, setQueue] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Write to localStorage whenever React state changes.
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(queue)); } catch { /* ignore */ }
  }, [queue, key]);

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
