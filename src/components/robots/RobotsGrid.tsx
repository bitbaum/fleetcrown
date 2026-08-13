"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Search } from "lucide-react";
import { RobotCard } from "./RobotCard";
import { NewRobotButton } from "./NewRobotButton";
import type { RobotWithAttributes } from "@/db/queries/robots";
import { getJson } from "@/lib/api/fetch";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants/timings";

export function RobotsGrid({
  initialRobots,
  initialTotal,
}: {
  initialRobots: RobotWithAttributes[];
  initialTotal: number;
}) {
  const [robots, setRobots] = useState(initialRobots);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const skipInitialFetch = useRef(true);

  const search = useCallback(async (q: string, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: "100" });
      const data = await getJson<{ robots: RobotWithAttributes[]; total: number }>(`/api/robots?${params}`, { signal });
      if (signal?.aborted) return;
      setFetchError(false);
      setRobots(data.robots);
      setTotal(data.total);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setFetchError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => search(query, ctrl.signal), SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, search]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search robots…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); (e.target as HTMLInputElement).blur(); } }}
            className="ui-search-input"
          />
          <span className="ui-badge absolute right-3 top-1/2 -translate-y-1/2">
            {total}
          </span>
        </div>
        <NewRobotButton onCreated={() => search(query)} />
      </div>

      {fetchError && (
        <div className="ui-callout-negative items-center justify-between text-status-negative">
          <span>Failed to load — check your connection and try again.</span>
          <button
            onClick={() => search(query)}
            className="ml-4 shrink-0 font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}

      {robots.length === 0 && !fetchError ? (
        <div className="ui-empty-panel">
          <Bot className="h-8 w-8" />
          <div className="text-base text-text-secondary">
            {query ? "No robots match your search" : "A vacuum is a robot. So is a humanoid."}
          </div>
          <p className="max-w-sm text-center text-sm text-text-tertiary">
            {query
              ? "Try another name."
              : "Add the machines you own. Each gets a profile. Book, rent, or sell from there — never people."}
          </p>
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="text-sm text-accent-text underline underline-offset-2 transition-colors hover:text-accent-hover"
            >
              Clear search
            </button>
          ) : (
            <NewRobotButton onCreated={() => search("")} />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {robots.map((robot) => (
            <RobotCard key={robot.id} robot={robot} />
          ))}
        </div>
      )}

      {loading && robots.length > 0 && (
        <p className="text-sm text-text-tertiary">Updating…</p>
      )}
    </>
  );
}
