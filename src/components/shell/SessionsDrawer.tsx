"use client";

// Sessions drawer — a slide-out right-side panel listing every project
// the user owns, with last-known state from project_states. Visible from
// every authenticated page so the user always has a cross-project view
// without having to navigate to /control or /projects.
//
// Persistent visibility was the gap surfaced during the 2026-06-04
// auto-injection thesis: /control answers "what's happening on the project
// I'm focused on RIGHT NOW", /projects answers "what's my inventory and
// health", but neither was a quick-glance "all my agents at once" surface.
// This is that surface.
//
// Triggered by the FleetIcon button in AppTopBar (see same commit).
// State is local-only; persists between page navigations via the React
// tree but resets on hard reload. Polls /api/sessions/snapshot every 30s
// while open; doesn't poll while closed.

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, GitBranch, Circle, RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/dates";
import { getJson } from "@/lib/api/fetch";
import type { SessionSnapshot, SessionSnapshotItem } from "@/app/api/sessions/snapshot/route";

const POLL_INTERVAL_MS = 30_000;

const PHASE_LABELS: Record<SessionSnapshotItem["state"]["phase"], string> = {
  working: "working",
  ready: "ready",
  open_idle: "open",
  closed: "closed",
  offline: "offline",
  unknown: "—",
};

// Status dot colors mirror /control. Kept inline (small palette, used only
// here); promote to globals.css `ui-phase-dot-*` if reused.
const PHASE_DOT_CLASS: Record<SessionSnapshotItem["state"]["phase"], string> = {
  working: "text-accent fill-accent animate-pulse",
  ready: "text-status-positive fill-status-positive",
  open_idle: "text-border-strong fill-border-strong",
  closed: "text-text-tertiary fill-text-tertiary",
  offline: "text-status-warning fill-status-warning",
  unknown: "text-border-default fill-border-default",
};

export function SessionsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch on open + on poll. Stop polling when closed to save tokens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function fetchSnapshot() {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getJson<SessionSnapshot>("/api/sessions/snapshot");
        if (!cancelled) setSnapshot(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSnapshot();
    timer = setInterval(fetchSnapshot, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const projects = snapshot?.projects ?? [];

  return (
    <>
      {/* Backdrop — semi-transparent, clickable to close. */}
      <div
        className="fixed inset-0 z-40 ui-backdrop"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer — slides in from the right. */}
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-surface-page border-l border-border-default shadow-panel-strong overflow-y-auto"
        role="dialog"
        aria-label="Sessions"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-default bg-surface-page px-4 py-3">
          <div>
            <h2 className="font-semibold text-text-primary">Sessions</h2>
            <p className="ui-micro-label text-text-tertiary">
              {projects.length} project{projects.length === 1 ? "" : "s"}
              {loading && <span className="ml-1.5">· refreshing…</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn-icon"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 py-3 space-y-2">
          {error && (
            <div className="ui-error p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="ui-empty-page py-8 text-center space-y-2">
              <p className="text-text-secondary">No projects yet.</p>
              <Link href="/control" className="text-accent underline text-sm">
                Create your first project →
              </Link>
            </div>
          )}

          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/control?focus=${encodeURIComponent(p.name)}`}
              onClick={onClose}
              className="ui-card-shell hover:border-accent transition-colors p-3 flex items-center gap-3 group"
            >
              <Circle className={`h-2.5 w-2.5 shrink-0 ${PHASE_DOT_CLASS[p.state.phase]}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-text-primary truncate">{p.name}</div>
                <div className="text-xs text-text-tertiary flex items-center gap-2 mt-0.5">
                  <span>{PHASE_LABELS[p.state.phase]}</span>
                  {p.state.lastActivity && (
                    <>
                      <span>·</span>
                      <span>{timeAgo(new Date(p.state.lastActivity).getTime())}</span>
                    </>
                  )}
                </div>
              </div>
              {p.gitUrl && (
                <a
                  href={p.gitUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ui-btn-icon shrink-0"
                  title="Open repo"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                </a>
              )}
            </Link>
          ))}

          {snapshot && (
            <p className="text-xs text-text-tertiary pt-2 text-center flex items-center justify-center gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Updated {timeAgo(new Date(snapshot.generatedAt).getTime())}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
