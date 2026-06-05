"use client";

// Cursor-style "recent local projects" suggester. Visible only when
// running inside Fleet Runner (the IPC method comes from the desktop
// preload). Lists the top-N most-recently-modified git repos found under
// ~/dev / ~/code / ~/Code / ~/Projects (overridable via FLEETCROWN_DEV_ROOTS
// env on the desktop process side).
//
// One click imports them all via /api/projects/import-from-local — same
// endpoint the terminal one-liner uses. The user can also click "Pick
// different ones" to go to the /control/import-local manual flow.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Terminal, Loader2 } from "lucide-react";
import type { FleetRunnerBridge } from "../desktop/types";

const SUGGESTED_COUNT = 5;

type LocalProject = { name: string; path: string; mtimeMs: number; remoteUrl: string | null };

function hasIPC(b: Window["fleetRunner"]): b is Pick<FleetRunnerBridge, "getLocalDevProjects"> {
  return typeof b?.getLocalDevProjects === "function";
}

export function LocalDevSuggestions() {
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    const bridge = window.fleetRunner;
    if (!hasIPC(bridge)) return;
    bridge.getLocalDevProjects()
      .then((d) => setProjects(d.projects.slice(0, SUGGESTED_COUNT)))
      .catch(() => { /* silent — banner just won't render */ });
  }, []);

  if (projects.length === 0) return null;

  async function importAll() {
    setImporting(true);
    setError(null);
    setTokenMissing(false);
    try {
      // The bulk import endpoint expects a ck_* token. When running inside
      // Fleet Runner with FleetRunnerAutoMint having completed, a token IS
      // stored on the desktop side; we read it via IPC and pass it as a
      // Bearer header. If loadToken returns null, the auto-mint hasn't
      // finished yet (rare timing) and we surface a hint to retry.
      const token = await window.fleetRunner?.loadToken?.();
      if (!token) {
        setTokenMissing(true);
        return;
      }
      const folders = projects.map((p) => ({
        name: p.name,
        path: p.path,
        ...(p.remoteUrl ? { remote_url: p.remoteUrl } : {}),
      }));
      const res = await fetch("/api/projects/import-from-local", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ folders }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Import failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="ui-card-shell-raised p-4 md:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Terminal className="h-5 w-5 text-accent mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">
            Import the {projects.length} most-recent repos in your dev folders?
          </div>
          <p className="text-sm text-text-muted mt-0.5">
            Fleet Runner spotted these on disk. One click registers them as FleetCrown projects.
          </p>
        </div>
      </div>

      <ul className="grid gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {projects.map((p) => (
          <li key={p.path} className="text-text-secondary truncate" title={p.path}>
            <span className="text-text-tertiary">•</span> {p.name}
          </li>
        ))}
      </ul>

      {tokenMissing && (
        <p className="text-xs text-status-warning">
          Fleet Runner is still pairing — give it a few seconds and click again.
        </p>
      )}
      {error && <p className="text-xs text-status-warning">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={importAll}
          disabled={importing}
          className="ui-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {importing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Importing…
            </>
          ) : (
            <>Import all {projects.length}</>
          )}
        </button>
        <a href="/control/import-local" className="ui-btn-ghost text-sm">
          Pick different ones →
        </a>
      </div>
    </section>
  );
}
