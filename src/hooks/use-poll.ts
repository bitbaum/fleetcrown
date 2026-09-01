"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "@/lib/api/fetch";

export type PollState<T> = {
  data: T | null;
  /** True only until the first response lands. Later refreshes are silent. */
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Interval fetch that waits for the previous request to finish before
 * scheduling the next one.
 *
 * `useFetch` fires on a fixed timer, so when a response takes longer than the
 * interval each new tick cancels the in-flight request and starts another. An
 * endpoint slower than its own poll therefore never delivers a single result:
 * the caller sits on `loading` forever and reads as broken. `/api/control/
 * open-tabs` hits exactly this on a local runtime host, where listing tabs
 * shells out to zellij and takes seconds against a 5s poll.
 *
 * The fix is to make the gap a *delay between* requests rather than a fixed
 * period. A slow endpoint then polls more slowly instead of never completing.
 * Kept separate from `useFetch` on purpose — that hook has dozens of call sites
 * whose timing this would change.
 */
export function usePoll<T>(url: string | null, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refetch = useCallback(() => setRevision((v) => v + 1), []);

  // Latest url in a ref so the loop reads the current one without restarting
  // the timer chain on every render.
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  // No URL means there is nothing to wait for: settle `loading` via a guarded
  // render-time adjustment instead of a sync setState inside the effect. Same
  // one-way latch as before — once false it never flips back.
  if (!url && loading) {
    setLoading(false);
  }

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      if (cancelled) return;
      try {
        const json = await getJson<T>(urlRef.current!);
        if (cancelled) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Scheduled only after the response — never overlapping.
          timer = window.setTimeout(() => void tick(), intervalMs);
        }
      }
    };
    void tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url, intervalMs, revision]);

  return { data, loading, error, refetch };
}
