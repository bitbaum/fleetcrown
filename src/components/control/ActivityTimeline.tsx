"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import { STATUS_DOT_CLASS, formatActivityTime } from "@/components/activity/activity-shared";
import type { ActivityKind, ProjectActivityEvent } from "@/db/queries/activity";

/**
 * Per-project activity timeline — renders the unified activity SSOT
 * (/api/control/activity → getProjectActivity) as a clean, newest-first feed:
 * every prompt dispatched, every run outcome, every lifecycle signal. This is
 * the "what has happened" half of the project cockpit (the live terminal is the
 * "now" half). Read-only; auto-refreshes while open so it tracks a working agent.
 */

const KIND_LABEL: Record<ActivityKind, string> = {
  dispatch: "Prompt",
  task_completed: "Done",
  task_failed: "Failed",
  input_requested: "Waiting",
  session_closed: "Closed",
  funding: "Funded",
};

const SOURCE_LABEL: Record<string, string> = {
  user: "you",
  autopilot: "autopilot",
  runner: "runner",
};

const REFRESH_MS = 5_000;

export function ActivityTimeline({ tab }: { tab: string }) {
  const [events, setEvents] = useState<ProjectActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = async () => {
    const mine = ++seq.current;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/control/activity?tab=${encodeURIComponent(tab)}`, {
        cache: "no-store",
      });
      if (mine !== seq.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Activity request failed (${res.status})`);
      }
      const body = (await res.json()) as { events: ProjectActivityEvent[] };
      setError(null);
      setEvents(body.events);
    } catch (e) {
      if (mine !== seq.current) return;
      setError((e as Error).message || "Couldn't load activity");
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between px-1 pb-2">
        <span className="ui-micro-label">Activity · last 7 days</span>
        {refreshing && <Loader2 className="h-3 w-3 animate-spin text-text-tertiary" aria-hidden />}
      </div>

      {error ? (
        <div className="px-1 text-sm text-text-secondary">
          <p className="font-medium text-status-warning">Couldn&apos;t load activity</p>
          <p className="mt-2 text-text-tertiary">{error}</p>
          <button type="button" onClick={() => void load()} className="ui-btn-ghost ui-btn-xs mt-3">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : events === null ? (
        <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading activity…
        </div>
      ) : events.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-text-tertiary">
          <p className="font-medium text-text-secondary">No activity yet</p>
          <p className="text-text-muted">
            Dispatch a prompt to this project and it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-overlay"
            >
              <span
                className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASS[ev.status])}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="ui-badge shrink-0">{KIND_LABEL[ev.kind]}</span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      ev.status === "negative" ? "text-status-negative" : "text-text-primary",
                    )}
                    title={ev.title}
                  >
                    {ev.title}
                  </span>
                  <span
                    className="shrink-0 text-micro text-text-muted tabular-nums"
                    title={formatActivityTime(ev.at)}
                  >
                    {timeAgo(Date.parse(ev.at))}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-micro text-text-muted">
                  <span>{SOURCE_LABEL[ev.source] ?? ev.source}</span>
                  {ev.adapter && <span>· {ev.adapter}</span>}
                  {ev.detail && (
                    <span className="min-w-0 truncate text-text-tertiary" title={ev.detail}>
                      · {ev.detail}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
