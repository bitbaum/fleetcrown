"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Check, ChevronDown, Loader2, MessageSquare, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "@/hooks/use-fetch";
import { patchJson, postJson, throwApiError } from "@/lib/api/fetch";
import { compactRelativeDate } from "@/lib/dates";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import type { FeedbackListItem, ProjectFeedbackSummary } from "@/db/queries/site-feedback";

/**
 * Fleet-wide feedback lens on /control: projects with NEW visitor feedback,
 * busiest first. The strip is also an inbox, not just a signpost — clicking a
 * project chip expands its NEW items inline with Dispatch fix / Resolve /
 * Archive per row, so the report→fix loop closes without leaving Control.
 * (Before, the only affordance was a link to the project page, where the
 * inbox sits below the full run history — six steps for the most common
 * action on this screen.) The project link remains for the full inbox
 * (screenshots, widget setup, AI review). Renders nothing when clear.
 */
export function FleetFeedbackStrip() {
  // The loop metrics ("13 resolved, median 6d report→fix") were dropped from
  // this strip 2026-08-13 — vanity stats in an action surface (user: "seems
  // like noise"). They still render on each project's feedback inbox.
  const { data, refetch } = useFetch<{ summary: ProjectFeedbackSummary[] }>("/api/feedback/summary");
  const summary = data?.summary ?? [];
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  if (summary.length === 0) return null;
  const open = summary.find((s) => s.projectId === openProjectId) ?? null;

  return (
    <div className="rounded-2xl border-l-2 border-accent-primary border-t border-r border-b border-border-subtle bg-surface-base">
      <div className="flex items-start gap-3 px-4 py-3">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-accent-text" aria-hidden="true" />
        <div className="flex min-w-0 flex-wrap gap-2">
          <span className="mt-0.5 shrink-0 text-xs font-medium text-text-secondary">New feedback:</span>
          {summary.map((s) => (
            <button
              key={s.projectId}
              type="button"
              onClick={() => setOpenProjectId((v) => (v === s.projectId ? null : s.projectId))}
              aria-expanded={openProjectId === s.projectId}
              className={cn(
                "ui-tap flex shrink-0 items-center gap-1.5 text-xs font-medium text-text-primary underline-offset-2 transition-colors hover:underline",
                openProjectId === s.projectId && "text-accent-text",
              )}
              title={`Latest ${compactRelativeDate(s.latestAt)} — triage ${s.projectName}'s new reports right here`}
            >
              {s.projectName}
              <span className="ui-badge">{s.newCount}</span>
              <ChevronDown className={cn("h-3 w-3 opacity-50 transition-transform", openProjectId === s.projectId && "rotate-180")} />
            </button>
          ))}
        </div>
      </div>
      {open && (
        <InlineFeedbackTriage
          key={open.projectId}
          projectId={open.projectId}
          projectName={open.projectName}
          onChanged={refetch}
        />
      )}
    </div>
  );
}

/** The NEW items of one project, triagable in place. Compact on purpose —
 *  screenshots, notes, widget setup, and resolved history stay on the
 *  project page; this surface exists to clear the inbox fast. */
function InlineFeedbackTriage({
  projectId,
  projectName,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  onChanged: () => void;
}) {
  const feedbackFetch = useFetch<{ feedback: FeedbackListItem[] }>(`/api/projects/${projectId}/feedback`);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = (feedbackFetch.data?.feedback ?? []).filter((f) => f.status === FEEDBACK_STATUS.NEW);

  async function act(id: string, run: () => Promise<Response>, fallback: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await run();
      if (!res.ok) await throwApiError(res, fallback);
      feedbackFetch.refetch();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-t border-border-subtle px-4 pb-3 pt-2">
      {error && <p className="ui-error mb-2">{error}</p>}
      {feedbackFetch.loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-text-tertiary">
          <Loader2 className="ui-spinner-xs" /> Loading {projectName}&apos;s new reports…
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 text-xs text-text-muted">Inbox clear — nothing new for {projectName}.</p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {items.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="ui-dot-warning mt-1.5 shrink-0" aria-hidden="true" />
                  <p className="min-w-0 text-sm leading-relaxed text-text-primary line-clamp-2">{f.suggestion}</p>
                  {f.duplicateCount > 1 && (
                    <span className="ui-badge shrink-0" title={`Reported ${f.duplicateCount} times`}>×{f.duplicateCount}</span>
                  )}
                </div>
                <p className="mt-0.5 truncate pl-4 text-xs text-text-tertiary">
                  {[f.page || f.url, compactRelativeDate(f.createdAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pl-4 sm:pl-0">
                <button
                  type="button"
                  onClick={() => act(f.id, () => postJson(`/api/feedback/${f.id}/dispatch`, {}), "Dispatch failed")}
                  disabled={busyId === f.id}
                  className="ui-btn-save gap-1.5"
                  title="Send to an agent as a fix task"
                >
                  {busyId === f.id ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
                  Dispatch fix
                </button>
                <button
                  type="button"
                  onClick={() => act(f.id, () => patchJson(`/api/feedback/${f.id}`, { status: FEEDBACK_STATUS.RESOLVED }), "Update failed")}
                  disabled={busyId === f.id}
                  className="ui-btn-icon"
                  title="Mark resolved"
                  aria-label="Mark resolved"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => act(f.id, () => patchJson(`/api/feedback/${f.id}`, { status: FEEDBACK_STATUS.ARCHIVED }), "Update failed")}
                  disabled={busyId === f.id}
                  className="ui-btn-icon"
                  title="Archive"
                  aria-label="Archive"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* text-text-tertiary rendered this at 3.13:1 on the card surface —
          below the 4.5:1 AA floor for 12px text, and half the contrast of the
          "New feedback:" label directly above it (6.38:1). It is the ONLY path
          to a report's screenshot, history and widget setup, so it has to be
          findable: an action nobody can see is a feature that does not exist. */}
      <Link
        href={`/projects/${projectId}#feedback`}
        className="mt-1 inline-block text-xs text-text-secondary underline underline-offset-2 decoration-border-subtle hover:decoration-current"
      >
        Full inbox — screenshots, history, widget setup →
      </Link>
    </div>
  );
}
