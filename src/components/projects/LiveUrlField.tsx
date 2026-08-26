"use client";

import { useState } from "react";
import { Globe, Pencil, X } from "lucide-react";

/**
 * The one place a captain sets where this project lives on the public web.
 * Atlas used to own this; the catalog and profile now share the same column.
 */
export function LiveUrlField({
  userProjectId,
  liveUrl,
  readonly,
}: {
  userProjectId: string | null;
  liveUrl: string | null;
  readonly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(liveUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(liveUrl);

  if (!userProjectId) return null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/atlas/site", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: userProjectId, liveUrl: value.trim() }),
      });
      const json = (await res.json()) as { liveUrl?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      setCurrent(json.liveUrl ?? null);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (editing && !readonly) {
    return (
      <div className="flex w-full flex-col gap-2 sm:w-auto">
        <div className="flex min-h-11 items-center gap-2">
          <input
            type="url"
            inputMode="url"
            autoComplete="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="yoursite.com"
            className="ui-input min-h-11 min-w-0 flex-1 sm:w-64"
            aria-label="Live site URL"
            autoFocus
          />
          <button type="button" className="ui-btn-primary min-h-11" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="ui-btn-icon min-h-11 min-w-11"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="text-xs text-status-negative">{error}</p>}
      </div>
    );
  }

  if (current) {
    return (
      <span className="inline-flex items-center gap-1">
        <a href={current} target="_blank" rel="noreferrer" className="ui-btn-ghost min-h-11 gap-1.5">
          <Globe className="h-4 w-4" aria-hidden="true" /> Live
        </a>
        {!readonly && (
          <button
            type="button"
            className="ui-btn-icon min-h-11 min-w-11"
            onClick={() => {
              setValue(current);
              setEditing(true);
            }}
            aria-label="Edit live URL"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </span>
    );
  }

  if (readonly) return null;

  return (
    <button
      type="button"
      className="ui-btn-ghost min-h-11 gap-1.5"
      onClick={() => setEditing(true)}
    >
      <Globe className="h-4 w-4" aria-hidden="true" /> Add live URL
    </button>
  );
}
