"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Archive, Pencil, Check, X } from "lucide-react";
import { format } from "date-fns";
import { DeleteButton } from "@/components/ui/delete-button";
import { deadlineLabel, toLocalDateStr } from "@/lib/dates";
import { patchJson, deleteJson } from "@/lib/api/fetch";
import { FIELD_INPUT_CLASS_COMPACT } from "@/components/ui/form";
import type { EventRow } from "@/db/queries/events";
import { EVENT_STATUS } from "@/lib/constants/statuses";

export function EventCard({
  event,
  onDelete,
  onArchive,
  onEdit,
  dimmed = false,
}: {
  event: EventRow;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  onEdit?: (updated: EventRow) => void;
  dimmed?: boolean;
}) {
  const [archiving, setArchiving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draftName, setDraftName] = useState("");
  const [draftDeadline, setDraftDeadline] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

  const deadline = event.deadline ? new Date(event.deadline) : null;
  const { label: deadlineText, overdue } = deadlineLabel(deadline);

  const openEdit = () => {
    setDraftName(event.name);
    setDraftDeadline(deadline ? toLocalDateStr(deadline) : "");
    setDraftDescription(event.description ?? "");
    setDraftUrl(event.url ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const handleSave = async () => {
    if (!draftName.trim()) return;
    setSaving(true);
    try {
      const res = await patchJson(`/api/events/${event.id}`, {
        name: draftName.trim(),
        deadline: draftDeadline || null,
        description: draftDescription.trim() || null,
        url: draftUrl.trim() || null,
      });
      const json = (await res.json()) as { ok: boolean; event: EventRow };
      if (json.ok) {
        onEdit?.(json.event);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    await patchJson(`/api/events/${event.id}`, { status: EVENT_STATUS.ARCHIVED });
    onArchive?.(event.id);
  };

  if (editing) {
    return (
      <div className="py-3 border-b border-white/[0.05] last:border-0 space-y-2">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") cancelEdit(); }}
          placeholder="Event name"
          autoFocus
          className={`${FIELD_INPUT_CLASS_COMPACT} w-full`}
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={draftDeadline}
            onChange={(e) => setDraftDeadline(e.target.value)}
            className={`${FIELD_INPUT_CLASS_COMPACT} flex-1`}
          />
          <input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="URL (optional)"
            className={`${FIELD_INPUT_CLASS_COMPACT} flex-1`}
          />
        </div>
        <input
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Description (optional)"
          className={`${FIELD_INPUT_CLASS_COMPACT} w-full`}
        />
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={cancelEdit}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draftName.trim()}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>
    );
  }

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
        {onEdit && !dimmed && (
          <button
            onClick={openEdit}
            title="Edit event"
            className="p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
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
