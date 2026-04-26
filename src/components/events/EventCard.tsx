"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Archive } from "lucide-react";
import { format } from "date-fns";
import { DeleteButton } from "@/components/ui/delete-button";
import { deadlineLabel } from "@/lib/dates";
import { patchJson, deleteJson } from "@/lib/api/fetch";
import type { EventRow } from "@/db/queries/events";

export function EventCard({
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
  const { label: deadlineText, overdue } = deadlineLabel(deadline);

  const handleArchive = async () => {
    setArchiving(true);
    await patchJson(`/api/events/${event.id}`, { status: "archived" });
    onArchive?.(event.id);
  };

  return (
    <div className={`group flex items-start gap-3 py-3 border-b border-white/[0.05] last:border-0 ${dimmed ? "opacity-50" : ""}`}>
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
              {deadlineText}
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
            await deleteJson(`/api/events/${event.id}`);
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
