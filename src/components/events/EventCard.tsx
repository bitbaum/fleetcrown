"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Archive, Pencil, Check, X } from "lucide-react";
import { format } from "date-fns";
import { DeleteButton } from "@/components/ui/delete-button";
import { deadlineLabel, toLocalDateStr } from "@/lib/dates";
import { patchJson, deleteJson, throwApiError } from "@/lib/api/fetch";
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
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const cancelEdit = () => { setEditing(false); setSaveError(null); };

  const handleSave = async () => {
    if (!draftName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await patchJson(`/api/events/${event.id}`, {
        name: draftName.trim(),
        deadline: draftDeadline || null,
        description: draftDescription.trim() || null,
        url: draftUrl.trim() || null,
      });
      const json = (await res.json()) as { ok: boolean; event: EventRow; error?: string };
      if (json.ok) {
        onEdit?.(json.event);
        setEditing(false);
      } else {
        setSaveError(json.error ?? "Failed to save");
      }
    } catch {
      setSaveError("Network error — try again");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    setArchiveError(null);
    try {
      const res = await patchJson(`/api/events/${event.id}`, { status: EVENT_STATUS.ARCHIVED });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setArchiveError(data.error ?? "Failed to archive");
        return;
      }
      onArchive?.(event.id);
    } catch {
      setArchiveError("Network error — try again");
    } finally {
      setArchiving(false);
    }
  };

  if (editing) {
    return (
      <div className="py-3 border-b border-border-subtle last:border-0 space-y-2">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") cancelEdit(); }}
          placeholder="Event name"
          autoFocus
          className="ui-input-compact w-full"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={draftDeadline}
            onChange={(e) => setDraftDeadline(e.target.value)}
            className="ui-input-compact flex-1"
          />
          <input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="URL (optional)"
            className="ui-input-compact flex-1"
          />
        </div>
        <input
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Description (optional)"
          className="ui-input-compact w-full"
        />
        {saveError && <p className="ui-error-xs">{saveError}</p>}
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={cancelEdit}
            className="ui-chip-action-compact inline-flex items-center gap-1 text-text-tertiary"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draftName.trim()}
            className="ui-btn-confirm-sm"
          >
            {saving ? <Loader2 className="ui-spinner-xs" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group py-3 border-b border-border-subtle last:border-0 ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="ui-micro-badge bg-surface-raised border-border-subtle text-text-secondary uppercase tracking-wide">
              {event.type}
            </span>
            {event.category && (
              <span className="ui-micro-badge bg-status-positive-subtle border-status-positive/20 text-status-positive/70 uppercase tracking-wide">
                {event.category}
              </span>
            )}
            {deadline && (
              <span className={`text-[10px] ml-auto shrink-0 ${overdue ? "text-status-negative" : "text-text-tertiary"}`}>
                {deadlineText}
                <span className="text-text-tertiary ml-1">· {format(deadline, "d MMM yyyy")}</span>
              </span>
            )}
          </div>

          <div className="flex items-start gap-1.5">
            <span className="text-sm text-text-primary leading-snug">{event.name}</span>
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-text-muted hover:text-text-secondary transition-colors mt-0.5"
                title={event.url}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {event.description && (
            <p className="text-xs text-text-tertiary leading-relaxed">{event.description}</p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-0.5 ui-hover-reveal transition-opacity">
          {onEdit && !dimmed && (
            <button
              onClick={openEdit}
              title="Edit event"
              className="ui-btn-row-action"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onArchive && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              title="Archive event"
              className="p-1.5 rounded text-text-muted hover:text-status-warning hover:bg-surface-raised transition-colors disabled:opacity-40"
            >
              {archiving ? <Loader2 className="ui-spinner-sm" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
          )}
          <DeleteButton
            onDelete={async () => {
              const res = await deleteJson(`/api/events/${event.id}`);
              if (!res.ok) await throwApiError(res, "Failed to delete");
              onDelete(event.id);
            }}
            label=""
            triggerTitle="Delete event"
            triggerClassName="p-1.5 rounded ui-btn-danger hover:bg-surface-raised transition-colors"
          />
        </div>
      </div>
      {archiveError && (
        <p className="mt-1 ui-error-xs">{archiveError}</p>
      )}
    </div>
  );
}
