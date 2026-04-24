"use client";

import { useState } from "react";
import { Search, ExternalLink, Plus, X, Loader2, Calendar, Archive, ChevronDown, ChevronRight } from "lucide-react";
import { isPast, format, formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import type { EventRow } from "@/db/queries/events";

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({
  event,
  onDelete,
  onArchive,
  dimmed = false,
}: {
  event: EventRow;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  dimmed?: boolean;
}) {
  const [archiving, setArchiving] = useState(false);
  const deadline = event.deadline ? new Date(event.deadline) : null;
  const overdue = deadline ? isPast(deadline) : false;

  const handleArchive = async () => {
    setArchiving(true);
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    onArchive?.(event.id);
  };

  return (
    <div className={`group flex items-start gap-3 py-3 border-b border-white/[0.05] last:border-0 ${dimmed ? "opacity-50" : ""}`}>
      {/* Type + category badges */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-white/50 uppercase tracking-wide font-medium">
            {event.type}
          </span>
          {event.category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/70 uppercase tracking-wide font-medium">
              {event.category}
            </span>
          )}
          {deadline && (
            <span className={`text-[10px] ml-auto shrink-0 ${overdue ? "text-red-400" : "text-white/35"}`}>
              {overdue ? "Overdue" : "Due"} {formatDistanceToNow(deadline, { addSuffix: true })}
              <span className="text-white/20 ml-1">· {format(deadline, "d MMM yyyy")}</span>
            </span>
          )}
        </div>

        <div className="flex items-start gap-1.5">
          <span className="text-sm text-white/85 leading-snug">{event.name}</span>
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-white/20 hover:text-white/60 transition-colors mt-0.5"
              title={event.url}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {event.description && (
          <p className="text-xs text-white/35 leading-relaxed line-clamp-2">{event.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {onArchive && (
          <button
            onClick={handleArchive}
            disabled={archiving}
            title="Archive event"
            className="p-1 rounded text-white/20 hover:text-amber-400 hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            {archiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
        )}
        <DeleteButton
          onDelete={async () => {
            await fetch(`/api/events/${event.id}`, { method: "DELETE" });
            onDelete(event.id);
          }}
          label=""
          triggerTitle="Delete event"
          triggerClassName="p-1 rounded text-white/20 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
        />
      </div>
    </div>
  );
}

// ─── AddEventForm ─────────────────────────────────────────────────────────────

function AddEventForm({ onCreated }: { onCreated: (event: EventRow) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName(""); setType(""); setUrl(""); setDeadline("");
    setCategory(""); setDescription(""); setError("");
  };

  const submit = async () => {
    if (!name.trim() || !type.trim()) {
      setError("Name and type are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, url, deadline, category, description }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      onCreated(data.event as EventRow);
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-white/25 hover:text-emerald-400 transition-colors pt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Add event
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 rounded-lg border border-white/10 bg-white/[0.02] space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-white/30">New Event</span>
        <button onClick={() => { setOpen(false); reset(); }} className="text-white/25 hover:text-white/60">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Event name *"
        autoFocus
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
      />
      <div className="flex gap-2">
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="Type * (e.g. workshop)"
          className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
        />
      </div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (optional)"
          className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
        />
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/25"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); reset(); } }}
        placeholder="Description (optional)"
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={submit}
          disabled={saving || !name.trim() || !type.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-medium transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
        <button onClick={() => { setOpen(false); reset(); }} className="text-xs text-white/30 hover:text-white/60">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── EventsGrid ───────────────────────────────────────────────────────────────

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

  // Unique types derived from active events — SSOT, no hardcoding
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
    if (event) setArchived((prev) => [{ ...event, status: "archived" }, ...prev]);
  };

  const handleCreated = (event: EventRow) => {
    setItems((prev) => event.deadline ? [event, ...prev] : [...prev, event]);
  };

  return (
    <>
      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            type="text"
            placeholder="Search events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-14 py-2.5 text-sm md:text-base focus:outline-none focus:border-white/20 placeholder:text-white/30"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
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
                  ? "border-white/30 bg-white/10 text-white/70"
                  : "border-white/10 bg-transparent text-white/30 hover:text-white/50 hover:border-white/20"
              }`}
            >
              {t}
            </button>
          ))}
          {typeFilter && (
            <button
              onClick={() => setTypeFilter(null)}
              className="px-2.5 py-1 rounded-full text-xs border border-white/10 text-white/25 hover:text-white/50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Active events */}
      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-white/25">
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
                  <EventCard key={event.id} event={event} onDelete={handleDelete} onArchive={handleArchive} />
                ))}
              </div>
            )}
            {withoutDeadline.length > 0 && (
              <div className={withDeadline.length > 0 ? "mt-2 pt-2 border-t border-white/[0.05]" : ""}>
                {withDeadline.length > 0 && (
                  <div className="text-[10px] uppercase tracking-wider text-white/20 mb-2">No deadline</div>
                )}
                {withoutDeadline.map((event) => (
                  <EventCard key={event.id} event={event} onDelete={handleDelete} onArchive={handleArchive} />
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
            className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition-colors"
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
