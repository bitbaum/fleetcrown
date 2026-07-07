"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { ActivityItem } from "@/db/queries/prompt-history";
import { getJson } from "@/lib/api/fetch";
import { EmptyState } from "@/components/ui/empty-state";
import { getIntentLabel } from "@/config/control-intents";

// Compact "time since" for the dispatch timestamp. Client-only display; recomputed
// on every refetch, which the parent triggers on each live bridge event.
function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * One side of the Duet view: a project picker plus that project's last prompt.
 * Self-contained — it owns its own fetch. The parent drives refresh via the
 * `tick` prop (incremented on every relevant bridge event) so a single SSE
 * connection feeds both panes.
 */
export function DuetPane({
  label,
  projects,
  projectKey,
  initialPrompt,
  tick,
  onSelectProject,
}: {
  label: string;
  projects: string[];
  projectKey: string | null;
  initialPrompt: ActivityItem | null;
  tick: number;
  onSelectProject: (projectKey: string | null) => void;
}) {
  const [prompt, setPrompt] = useState<ActivityItem | null>(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest selected key, read inside async callbacks to drop stale responses
  // when the user switches projects mid-flight.
  const keyRef = useRef(projectKey);
  keyRef.current = projectKey;

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const { prompt } = await getJson<{ prompt: ActivityItem | null }>(
        `/api/control/last-prompt?tab=${encodeURIComponent(key)}`,
      );
      if (keyRef.current !== key) return; // a newer selection won
      setPrompt(prompt);
    } catch (err) {
      if (keyRef.current !== key) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (keyRef.current === key) setLoading(false);
    }
  }, []);

  // Refetch when the selected project changes. Skip the first mount — the
  // server already provided initialPrompt for the initial selection.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (projectKey) load(projectKey);
    else setPrompt(null);
  }, [projectKey, load]);

  // Live refresh: the parent bumps `tick` (coalesced) on every relevant bridge
  // event. tick === 0 is the initial value, so it never fires on mount.
  useEffect(() => {
    if (tick > 0 && keyRef.current) load(keyRef.current);
  }, [tick, load]);

  return (
    <div className="ui-card-shell ui-card-padding flex flex-col gap-4 min-h-96">
      <div className="flex items-center justify-between gap-3">
        <span className="ui-micro-label">{label}</span>
        {loading && <span className="ui-micro-label">updating…</span>}
      </div>

      <select
        className="ui-input-compact"
        value={projectKey ?? ""}
        onChange={(e) => onSelectProject(e.target.value || null)}
        aria-label={`${label} project`}
      >
        <option value="">Select project…</option>
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {error ? (
        <EmptyState icon={MessageSquare} title="Couldn't load" size="sm">
          {error}
        </EmptyState>
      ) : !projectKey ? (
        <EmptyState icon={MessageSquare} title="No project selected" size="sm">
          Pick a project to watch its agent&apos;s last prompt.
        </EmptyState>
      ) : !prompt ? (
        <EmptyState icon={MessageSquare} title="No prompts yet" size="sm">
          Nothing has been dispatched to this project. Send a prompt and it appears here live.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-tag">{prompt.adapter}</span>
            <span className="text-sm text-text-tertiary">{getIntentLabel(prompt.intent)}</span>
            <span className="text-sm text-text-tertiary">· {timeAgo(prompt.dispatchedAt)}</span>
          </div>
          <div className="ui-card-shell-raised ui-card-padding flex-1 overflow-auto whitespace-pre-wrap break-words text-sm text-text-secondary">
            {prompt.displayText}
          </div>
        </>
      )}
    </div>
  );
}
