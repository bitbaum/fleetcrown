"use client";

import { useState } from "react";
import { Search, Calendar, Archive, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EventCard } from "./EventCard";
import { AddEventForm } from "./AddEventForm";
import type { EventRow } from "@/db/queries/events";
import { EVENT_STATUS } from "@/lib/constants/statuses";

export function EventsGrid({
  initialEvents,
  initialArchived = [],
}: {
  initialEvents: EventRow[];
  initialArchived?: EventRow[];
}) {
  const [items, setItems] = useState(initialEvents);
  const [archived, setArchived] = useState(initialArchived);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const types = [...new Set(items.map((e) => e.type).filter(Boolean))].sort() as string[];

  const q = query.trim().toLowerCase();
  const filtered = items.filter((e) => {
    const matchesQuery = !q
      || e.name.toLowerCase().includes(q)
      || e.description?.toLowerCase().includes(q)
      || e.category?.toLowerCase().includes(q);
    const matchesType = !typeFilter || e.type === typeFilter;
    return matchesQuery && matchesType;
  });

  const withDeadline = filtered.filter((e) => e.deadline);
  const withoutDeadline = filtered.filter((e) => !e.deadline);

  const handleDelete = (id: string) => setItems((prev) => prev.filter((e) => e.id !== id));
  const handleDeleteArchived = (id: string) => setArchived((prev) => prev.filter((e) => e.id !== id));

  const handleArchive = (id: string) => {
    const event = items.find((e) => e.id === id);
    setItems((prev) => prev.filter((e) => e.id !== id));
    if (event) setArchived((prev) => [{ ...event, status: EVENT_STATUS.ARCHIVED }, ...prev]);
  };

  const handleEdit = (updated: EventRow) =>
    setItems((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

  const handleCreated = (event: EventRow) => {
    setItems((prev) => event.deadline ? [event, ...prev] : [...prev, event]);
  };

  return (
    <>
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-14 py-2.5 text-sm md:text-base focus:outline-none focus:border-white/20 placeholder:text-text-muted"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
            {q || typeFilter ? `${filtered.length} / ${items.length}` : items.length}
          </span>
        </div>
      </div>

      {/* Type filter chips */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                typeFilter === t
                  ? "border-white/30 bg-white/10 text-text-secondary"
                  : "border-white/10 bg-transparent text-text-muted hover:text-text-secondary hover:border-white/20"
              }`}
            >
              {t}
            </button>
          ))}
          {typeFilter && (
            <button
              onClick={() => setTypeFilter(null)}
              className="px-2.5 py-1 rounded-full text-xs border border-white/10 text-text-muted hover:text-text-secondary transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Active events */}
      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-text-muted">
            <Calendar className="h-8 w-8" />
            <div className="text-sm">
              {q || typeFilter ? "No events match your filter" : "No events recorded yet"}
            </div>
          </div>
        ) : (
          <div>
            {withDeadline.length > 0 && (
              <div>
                {withDeadline.map((event) => (
                  <EventCard key={event.id} event={event} onDelete={handleDelete} onArchive={handleArchive} onEdit={handleEdit} />
                ))}
              </div>
            )}
            {withoutDeadline.length > 0 && (
              <div className={withDeadline.length > 0 ? "mt-2 pt-2 border-t border-white/[0.05]" : ""}>
                {withDeadline.length > 0 && (
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">No deadline</div>
                )}
                {withoutDeadline.map((event) => (
                  <EventCard key={event.id} event={event} onDelete={handleDelete} onArchive={handleArchive} onEdit={handleEdit} />
                ))}
              </div>
            )}
          </div>
        )}

        <AddEventForm onCreated={handleCreated} />
      </Card>

      {/* Archived events — collapsible */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            {showArchived ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Archive className="h-3 w-3" />
            {archived.length} archived
          </button>
          {showArchived && (
            <Card className="mt-2">
              {archived.map((event) => (
                <EventCard key={event.id} event={event} onDelete={handleDeleteArchived} dimmed />
              ))}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
