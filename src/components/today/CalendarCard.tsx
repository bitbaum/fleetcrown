"use client";

import { Calendar } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { useFetch } from "@/hooks/use-fetch";

type CalendarEvent = {
  summary?: string;
  title?: string;
  start?: string;
  startTime?: string;
  location?: string;
};

export function CalendarCard() {
  const { data, loading, error } = useFetch<{ events: CalendarEvent[]; error?: string }>("/api/calendar");
  const events = data?.events ?? [];

  return (
    <Card>
      <CardHeader icon={Calendar} title="Calendar" />
      {loading ? (
        <div className="text-sm text-white/30 animate-pulse">Loading...</div>
      ) : error || (data?.error && events.length === 0) ? (
        <div className="text-sm text-white/30">{error ?? data?.error}</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-white/30">No events today</div>
      ) : (
        <div className="space-y-2">
          {events.map((event, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="text-xs text-white/40 font-mono w-12 shrink-0 pt-0.5">
                {formatTime(event.start ?? event.startTime)}
              </div>
              <div>
                <div className="text-sm font-medium">{event.summary ?? event.title ?? "Untitled"}</div>
                {event.location && (
                  <div className="text-xs text-white/40">{event.location}</div>
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
    return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
