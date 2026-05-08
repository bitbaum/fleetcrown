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

  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(queue)); } catch { /* ignore */ }
  }, [queue, key]);

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

  const clear = useCallback(() => setQueue([]), []);

  return { queue, enqueue, shift, remove, clear };
}
