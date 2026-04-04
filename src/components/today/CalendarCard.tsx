"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

type CalendarEvent = {
  summary?: string;
  title?: string;
  start?: string;
  startTime?: string;
  end?: string;
  endTime?: string;
  location?: string;
};

export function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then((res) => res.json())
      .then((data) => {
        setEvents(Array.isArray(data.events) ? data.events : []);
        if (data.error) setError(data.error);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-white/50" />
        <h3 className="text-sm font-medium text-white/70">Calendar</h3>
      </div>
      {loading ? (
        <div className="text-sm text-white/30 animate-pulse">Loading...</div>
      ) : error && events.length === 0 ? (
        <div className="text-sm text-white/30">{error}</div>
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
    </div>
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
