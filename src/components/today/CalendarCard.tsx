"use client";

import { Calendar } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FetchErrorState } from "@/components/ui/fetch-error-state";
import { useFetch } from "@/hooks/use-fetch";
import { APP_LOCALE } from "@/lib/constants";

type CalendarEvent = {
  summary?: string;
  title?: string;
  start?: string;
  startTime?: string;
  location?: string;
};

export function CalendarCard() {
  const { data, loading, error, refetch } = useFetch<{ events: CalendarEvent[]; error?: string }>("/api/calendar", { intervalMs: 5 * 60_000, timeoutMs: 12_000 });
  const events = data?.events ?? [];

  return (
    <Card>
      <CardHeader icon={Calendar} title="Calendar" />
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="h-3 w-12 rounded bg-border-default shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-border-default rounded w-3/4" />
                {i === 0 && <div className="h-3 bg-border-subtle rounded w-1/2" />}
              </div>
            </div>
          ))}
        </div>
      ) : error || (data?.error && events.length === 0) ? (
        <FetchErrorState message="Couldn't load calendar" detail={error ?? data?.error} onRetry={refetch} />
      ) : events.length === 0 ? (
        <EmptyState>No events today</EmptyState>
      ) : (
        <div className="space-y-2">
          {events.map((event, i) => (
            <div key={`${event.start ?? event.startTime ?? i}-${event.summary ?? event.title ?? i}`} className="flex gap-3 items-start">
              <div className="text-xs text-text-tertiary font-mono w-12 shrink-0 pt-0.5">
                {formatTime(event.start ?? event.startTime)}
              </div>
              <div>
                <div className="text-sm font-medium">{event.summary ?? event.title ?? "Untitled"}</div>
                {event.location && (
                  <div className="text-xs text-text-tertiary">{event.location}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function formatTime(time: string | undefined): string {
  if (!time) return "";
  try {
    const d = new Date(time);
    if (isNaN(d.getTime())) return time.slice(0, 5);
    return d.toLocaleTimeString(APP_LOCALE, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
