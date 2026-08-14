"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Check, ChevronDown, Layers, Loader2, MessageSquare, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "@/hooks/use-fetch";
import { patchJson, postJson, throwApiError } from "@/lib/api/fetch";
import { compactRelativeDate } from "@/lib/dates";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { SYNTHESIZE_MIN_ITEMS } from "@/lib/feedback/compose-dispatch";
import { deriveFeedbackWork, FEEDBACK_WORK_PHASE } from "@/lib/feedback/work-phase";
import type { FeedbackListItemWithWork } from "@/lib/feedback/attach-work";
import type { ProjectFeedbackSummary } from "@/db/queries/site-feedback";
import { FeedbackWorkBadge } from "@/components/feedback/FeedbackWorkBadge";

/**
 * Fleet-wide feedback lens on /control. Shows NEW + in-progress (not resolved)
 * so Implement → Queued → Working → Done is visible without vanishing rows.
 */
export function FleetFeedbackStrip() {
  const { data, refetch } = useFetch<{ summary: ProjectFeedbackSummary[] }>("/api/feedback/summary");
  const summary = data?.summary ?? [];
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [didAutoOpen, setDidAutoOpen] = useState(false);

  useEffect(() => {
    if (didAutoOpen || summary.length === 0) return;
    setOpenProjectId(summary[0].projectId);
    setDidAutoOpen(true);
  }, [summary, didAutoOpen]);

  if (summary.length === 0) return null;
  const open = summary.find((s) => s.projectId === openProjectId) ?? null;

  return (
    <div className="ui-panel border-l-2 border-l-accent-primary">
      <div className="flex items-start gap-3 px-4 py-3">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="flex min-w-0 flex-wrap gap-2">
          <span className="mt-0.5 shrink-0 text-xs font-medium text-text-secondary">Feedback:</span>
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
              title={`Latest ${compactRelativeDate(s.latestAt)} — ${s.newCount} new`}
            >
              <span>{s.projectName}</span>
              <span className="ui-badge">{s.newCount} new</span>
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

function InlineFeedbackTriage({
  projectId,
  projectName,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  onChanged: () => void;
}) {
  const feedbackFetch = useFetch<{ feedback: FeedbackListItemWithWork[] }>(`/api/projects/${projectId}/feedback`);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [synthBusy, setSynthBusy] = useState(false);
  const [synthDone, setSynthDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open work stays visible: new + anything not resolved/archived.
  const items = (feedbackFetch.data?.feedback ?? [])
    .filter((f) => f.status === FEEDBACK_STATUS.NEW || f.status === FEEDBACK_STATUS.DISPATCHED)
    .map((f) => ({ ...f, work: f.work ?? deriveFeedbackWork(f.status, null) }));
  const newItems = items.filter((f) => f.status === FEEDBACK_STATUS.NEW);
  const controlHref = `/control?focus=${encodeURIComponent(projectName)}`;
  const terminalHref = `/terminal?source=server&tab=${encodeURIComponent(projectName)}`;

  useEffect(() => {
    const live = items.some(
      (f) => f.work.phase === FEEDBACK_WORK_PHASE.QUEUED || f.work.phase === FEEDBACK_WORK_PHASE.WORKING,
    );
    if (!live) return;
    const t = window.setInterval(() => feedbackFetch.refetch(), 8_000);
    return () => window.clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((f) => f.work.phase).join("|")]);

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

  async function dispatchAll() {
    setBatchBusy(true);
    setError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/feedback/dispatch-batch`, {});
      if (!res.ok) await throwApiError(res, "Implement all failed");
      feedbackFetch.refetch();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Implement all failed");
    } finally {
      setBatchBusy(false);
    }
  }

  async function synthesize() {
    setSynthBusy(true);
    setError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/feedback/synthesize`, {});
      if (!res.ok) await throwApiError(res, "Synthesize failed");
      setSynthDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Synthesize failed");
    } finally {
      setSynthBusy(false);
    }
  }

  return (
    <div className="border-t border-border-subtle px-4 pb-3 pt-2">
      {error && <p className="ui-error mb-2">{error}</p>}
      {newItems.length >= 2 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={dispatchAll}
            disabled={batchBusy || busyId !== null}
            className="ui-btn-save gap-1.5"
            title="One agent run for every not-started report"
          >
            {batchBusy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
            Implement all ({newItems.length})
          </button>
          {newItems.length >= SYNTHESIZE_MIN_ITEMS && (
            <button
              type="button"
              onClick={synthesize}
              disabled={synthBusy || synthDone}
              className="ui-btn-secondary gap-1.5"
              title="Cluster into theme briefs"
            >
              {synthBusy ? <Loader2 className="ui-spinner-xs" /> : <Layers className="h-3.5 w-3.5" />}
              {synthDone ? "Synthesis queued" : "Synthesize themes"}
            </button>
          )}
        </div>
      )}
      {feedbackFetch.loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-text-tertiary">
          <Loader2 className="ui-spinner-xs" /> Loading {projectName}&apos;s feedback…
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 text-xs text-text-muted">Nothing open for {projectName}.</p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {items.map((f) => {
            const work = f.work;
            return (
              <div key={f.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span
                      className={
                        work.phase === FEEDBACK_WORK_PHASE.WORKING || work.phase === FEEDBACK_WORK_PHASE.DONE
                          ? "ui-dot-positive mt-1.5 shrink-0"
                          : work.phase === FEEDBACK_WORK_PHASE.FAILED || work.phase === FEEDBACK_WORK_PHASE.STUCK
                            ? "ui-dot-negative mt-1.5 shrink-0"
                            : "ui-dot-warning mt-1.5 shrink-0"
                      }
                      aria-hidden="true"
                    />
                    <p className="min-w-0 text-sm leading-relaxed text-text-primary line-clamp-2">{f.suggestion}</p>
                    <FeedbackWorkBadge work={work} />
                  </div>
                  <p className="mt-0.5 truncate pl-4 text-xs text-text-tertiary">
                    {[f.page || f.url, f.scope, compactRelativeDate(f.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                  {work.detail && (
                    <p className="mt-0.5 pl-4 text-xs text-text-secondary line-clamp-2">{work.detail}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pl-4 sm:pl-0">
                  {work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED ? (
                    <button
                      type="button"
                      onClick={() => act(f.id, () => postJson(`/api/feedback/${f.id}/dispatch`, {}), "Implement failed")}
                      disabled={busyId === f.id || batchBusy}
                      className="ui-btn-save gap-1.5"
                    >
                      {busyId === f.id ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
                      Implement
                    </button>
                  ) : work.phase === FEEDBACK_WORK_PHASE.STUCK || work.phase === FEEDBACK_WORK_PHASE.FAILED ? (
                    <button
                      type="button"
                      onClick={() => act(f.id, () => postJson(`/api/feedback/${f.id}/dispatch`, {}), "Retry failed")}
                      disabled={busyId === f.id || batchBusy}
                      className="ui-btn-save gap-1.5"
                    >
                      {busyId === f.id ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
                      Retry
                    </button>
                  ) : null}
                  {(work.phase === FEEDBACK_WORK_PHASE.QUEUED
                    || work.phase === FEEDBACK_WORK_PHASE.WORKING
                    || work.phase === FEEDBACK_WORK_PHASE.STUCK
                    || work.phase === FEEDBACK_WORK_PHASE.FAILED
                    || work.phase === FEEDBACK_WORK_PHASE.DONE) && (
                    <a
                      href={work.phase === FEEDBACK_WORK_PHASE.WORKING ? terminalHref : controlHref}
                      className="ui-btn-secondary gap-1.5 text-xs"
                      title={
                        work.phase === FEEDBACK_WORK_PHASE.WORKING
                          ? "Live agent session"
                          : "Open this project on Control — Terminal is empty until a session is actually running"
                      }
                    >
                      {work.phase === FEEDBACK_WORK_PHASE.WORKING ? "Watch" : "Open on Control"}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => act(f.id, () => patchJson(`/api/feedback/${f.id}`, { status: FEEDBACK_STATUS.RESOLVED }), "Update failed")}
                    disabled={busyId === f.id || batchBusy}
                    className="ui-btn-icon"
                    title="Mark resolved"
                    aria-label="Mark resolved"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => act(f.id, () => patchJson(`/api/feedback/${f.id}`, { status: FEEDBACK_STATUS.ARCHIVED }), "Update failed")}
                    disabled={busyId === f.id || batchBusy}
                    className="ui-btn-icon"
                    title="Archive"
                    aria-label="Archive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Link
        href={`/projects/${projectId}#feedback`}
        className="mt-1 inline-block text-xs text-text-tertiary underline-offset-2 hover:underline"
      >
        Full inbox →
      </Link>
    </div>
  );
}
