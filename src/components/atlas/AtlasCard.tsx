"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, GitBranch, Pencil, Check, X, ImageOff } from "lucide-react";
import { shortTimeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AtlasRow } from "@/db/queries/atlas";

function hostLabel(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The single most useful fact about a site, in one word. Kept as one function
 *  so the card, the summary counts, and the sort order cannot disagree. */
export type SiteState = "up" | "down" | "unchecked" | "no-site";

export function siteState(row: AtlasRow): SiteState {
  if (!row.liveUrl) return "no-site";
  if (!row.snapshot) return "unchecked";
  return row.snapshot.ok ? "up" : "down";
}

const STATE_LABEL: Record<SiteState, string> = {
  up: "Live",
  down: "Down",
  unchecked: "Not checked",
  "no-site": "No site",
};

export function AtlasCard({
  row,
  onSaved,
}: {
  row: AtlasRow;
  onSaved: (projectId: string, liveUrl: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.liveUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = siteState(row);
  const snap = row.snapshot;
  const displayTitle = snap?.title ?? row.name;
  const displayDescription = snap?.description ?? row.description;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/atlas/site", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: row.projectId, liveUrl: value.trim() }),
      });
      const json = (await res.json()) as { liveUrl?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      onSaved(row.projectId, json.liveUrl ?? null);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised">
      <div className="relative aspect-[1200/630] w-full overflow-hidden border-b border-border-subtle bg-surface-overlay">
        {snap?.previewImageUrl ? (
          /* Previews come from arbitrary user-owned hosts; next/image would need
             every one allow-listed in next.config, which defeats the point. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snap.previewImageUrl}
            alt={`Preview of ${row.name}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-tertiary">
            <ImageOff className="h-5 w-5" aria-hidden />
            <span className="text-xs">
              {state === "no-site" ? "No site registered" : "No preview image"}
            </span>
          </div>
        )}
        <span
          className={cn(
            "absolute left-3 top-3 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm",
            state === "up" && "bg-status-positive/15 text-status-positive",
            state === "down" && "bg-status-negative/15 text-status-negative",
            state === "unchecked" && "bg-status-warning/15 text-status-warning",
            state === "no-site" && "bg-surface-overlay text-text-tertiary",
          )}
        >
          {STATE_LABEL[state]}
          {snap?.statusCode ? ` · ${snap.statusCode}` : ""}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-text-primary">{row.name}</h3>
            {displayTitle !== row.name && (
              <p className="truncate text-xs text-text-tertiary">{displayTitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setEditing((v) => !v); setValue(row.liveUrl ?? ""); }}
            className="shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-overlay hover:text-text-secondary"
            aria-label={row.liveUrl ? `Edit site URL for ${row.name}` : `Add site URL for ${row.name}`}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {displayDescription && (
          <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">{displayDescription}</p>
        )}

        {editing ? (
          <div className="mt-1 flex items-center gap-1.5">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
              placeholder="kivvi.orangecat.ch"
              aria-label={`Site URL for ${row.name}`}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-border-default bg-surface-overlay px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg p-1.5 text-status-positive hover:bg-surface-overlay disabled:opacity-50"
              aria-label="Save site URL"
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-overlay"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          row.liveUrl && (
            <a
              href={row.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-primary hover:underline"
            >
              {hostLabel(row.liveUrl)}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )
        )}

        {error && <p className="text-xs text-status-negative">{error}</p>}

        {snap?.error && !editing && (
          <p className="truncate text-xs text-status-negative" title={snap.error}>{snap.error}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-text-tertiary">
          <span>
            {snap
              ? `Checked ${shortTimeAgo(new Date(snap.checkedAt).getTime())} ago${snap.responseMs ? ` · ${snap.responseMs}ms` : ""}`
              : "Never checked"}
          </span>
          <span className="flex items-center gap-2">
            {row.gitUrl && (
              <a
                href={row.gitUrl.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "")}
                target="_blank"
                rel="noreferrer"
                className="hover:text-text-secondary"
                aria-label={`${row.name} repository`}
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {row.entityId && (
              <Link href={`/projects/${row.entityId}`} className="hover:text-text-secondary">
                Profile
              </Link>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
