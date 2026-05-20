"use client";

import { useState, useEffect } from "react";
import { getJson } from "@/lib/api/fetch";
import { COCKPIT_REFRESH_EVENT } from "@/lib/client-events";

/**
 * Default abort ceiling for every useFetch call. Individual sites can pass
 * `timeoutMs` to tighten (8_000 for weather, 12_000 for calendar, 10_000 for
 * system, 15_000 for GitHub) or pass `timeoutMs: 0` to disable entirely.
 * 20s is intentionally generous — it catches genuinely-hung calls without
 * tripping cold serverless paths.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

export function useFetch<T>(
  url: string | null,
  { intervalMs, timeoutMs }: { intervalMs?: number; timeoutMs?: number } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refetch = () => setRevision((v) => v + 1);

  // Resolve timeout: explicit number wins, including 0 (disable). Undefined → default.
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  useEffect(() => {
    if (!url) { setLoading(false); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    setLoading(true);
    setError(null);

    const controller = effectiveTimeoutMs > 0 ? new AbortController() : null;
    const timeoutId = effectiveTimeoutMs > 0 && controller
      ? setTimeout(() => controller.abort(), effectiveTimeoutMs)
      : null;

    getJson<T>(url, controller ? { signal: controller.signal } : undefined)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(`Timed out after ${Math.round(effectiveTimeoutMs / 1000)}s`);
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
  }, [url, revision, effectiveTimeoutMs]);

  // Silent background refresh — setRevision is stable so no ref needed.
  useEffect(() => {
    if (!intervalMs || !url) return;
    const id = setInterval(() => setRevision((v) => v + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, url]);

  // Listen for the global refresh event (currently fired by PullToRefresh).
  // Lets a single user gesture refresh both server-component data
  // (router.refresh) and every client-side useFetch poll at once.
  useEffect(() => {
    if (!url) return;
    const handler = () => setRevision((v) => v + 1);
    window.addEventListener(COCKPIT_REFRESH_EVENT, handler);
    return () => window.removeEventListener(COCKPIT_REFRESH_EVENT, handler);
  }, [url]);

  return { data, loading, error, refetch };
}
