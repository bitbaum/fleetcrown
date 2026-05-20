"use client";

import { useState, useEffect } from "react";
import { getJson } from "@/lib/api/fetch";

export function useFetch<T>(
  url: string | null,
  { intervalMs, timeoutMs }: { intervalMs?: number; timeoutMs?: number } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refetch = () => setRevision((v) => v + 1);

  useEffect(() => {
    if (!url) { setLoading(false); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    setLoading(true);
    setError(null);

    const controller = timeoutMs ? new AbortController() : null;
    const timeoutId = timeoutMs && controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    getJson<T>(url, controller ? { signal: controller.signal } : undefined)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(`Timed out after ${Math.round((timeoutMs ?? 0) / 1000)}s`);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [url, revision, timeoutMs]);

  // Silent background refresh — setRevision is stable so no ref needed.
  useEffect(() => {
    if (!intervalMs || !url) return;
    const id = setInterval(() => setRevision((v) => v + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, url]);

  return { data, loading, error, refetch };
}
