"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Check, Loader2, PenLine, Rocket, Star, Undo2 } from "lucide-react";
import { compactRelativeDate } from "@/lib/dates";
import { FEEDBACK_SOURCE, FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { deriveFeedbackWork, FEEDBACK_WORK_PHASE } from "@/lib/feedback/work-phase";
import type { FeedbackListItem } from "@/db/queries/site-feedback";
import type { FeedbackListItemWithWork } from "@/lib/feedback/attach-work";
import { FeedbackWorkBadge } from "@/components/feedback/FeedbackWorkBadge";
import { fleetSurfaceHref } from "@/lib/fleet-context";
import { absoluteFeedbackPageHref } from "@/lib/feedback/page-href";

/**
 * One feedback item, everywhere feedback renders: the per-project section and
 * the cross-project /feedback inbox. Layout rule: every fragment is LABELED by
 * placement or wording — the message leads, context (page · reporter · age)
 * reads as a sentence, the element target is humanized ("image — 'Send'")
 * with the raw CSS selector demoted to a hover title. The old card printed
 * the selector as a naked mono line, which read as debug output.
 */
export function FeedbackItemRow({
  feedback: f,
  projectName,
  project,
  busy,
  onDispatch,
  onResolve,
  onArchive,
  onReopen,
  onFeature,
}: {
  feedback: FeedbackListItemWithWork | FeedbackListItem;
  projectName: string;
  /** Set on cross-project surfaces: renders a project chip linking home. */
  project?: { id: string; name: string } | null;
  busy: boolean;
  onDispatch: (note?: string) => void;
  onResolve: () => void;
  onArchive: () => void;
  onReopen: () => void;
  onFeature: () => void;
}) {
  // "Comment then implement" without a comment thread: the note IS an edit to
  // the dispatch prompt. Plain Implement stays one-click.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const work = "work" in f && f.work ? f.work : deriveFeedbackWork(f.status, null);
  const controlHref = fleetSurfaceHref("control", projectName);
  const terminalHref = fleetSurfaceHref("terminal", projectName);
  const watchLive = work.phase === FEEDBACK_WORK_PHASE.WORKING;
  const progressHref = watchLive ? terminalHref : controlHref;
  const progressLabel = watchLive ? "Watch" : "Open on Control";
  const progressTitle = watchLive
    ? (work.detail ?? "Live agent session")
    : "Open this project on Control — Terminal is empty until a session is actually running";
  // Reported page surface — Check live must open this, not Control/Terminal.
  const livePageHref = absoluteFeedbackPageHref(f.url, f.page);
  // Agent-filed rows get a typed badge instead of their magic contact string.
  const agentBadge =
    f.source === FEEDBACK_SOURCE.AI_REVIEW
      ? "AI review"
      : f.source === FEEDBACK_SOURCE.SYNTHESIZER
        ? "brief"
        : null;
  // One line of context: where, who, when. The scope is implied by the
  // element chip (element) or by its absence (page); the run id is a lookup
  // key, not something a reader can act on, so it stays out of the line.
  const pageLabel = f.page || (f.url ? f.url.replace(/^https?:\/\/[^/]+/, "") || f.url : null);
  const meta = [
    pageLabel,
    !agentBadge && f.contact,
    f.status === FEEDBACK_STATUS.RESOLVED && f.resolvedAt
      ? `resolved ${compactRelativeDate(f.resolvedAt)}`
      : compactRelativeDate(f.createdAt),
  ].filter(Boolean);
  const failed =
    work.phase === FEEDBACK_WORK_PHASE.FAILED || work.phase === FEEDBACK_WORK_PHASE.STUCK;
  // The badge is the status; a "Not started" chip on every untouched report
  // said nothing the Implement button did not.
  const showBadge = work.phase !== FEEDBACK_WORK_PHASE.NOT_STARTED;
  const badge =
    work.phase === FEEDBACK_WORK_PHASE.NEEDS_VERIFY && livePageHref ? (
      <a
        href={livePageHref}
        target="_blank"
        rel="noreferrer"
        className="shrink-0"
        title="Open the reported page"
      >
        <FeedbackWorkBadge work={work} />
      </a>
    ) : (
      <FeedbackWorkBadge work={work} />
    );

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          {/* The message leads, alone on its line. Status, source and repeat
              count sit on the context line beneath it, where they read as
              facts about the report instead of interrupting it. */}
          <p className="min-w-0 text-sm leading-relaxed text-text-primary">{f.suggestion}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
            {showBadge && badge}
            {agentBadge && <span className="ui-tag shrink-0">{agentBadge}</span>}
            {f.duplicateCount > 1 && (
              <span className="ui-badge shrink-0" title={`Reported ${f.duplicateCount} times`}>
                ×{f.duplicateCount}
              </span>
            )}
            {project && (
              <Link
                href={`/projects/${project.id}#feedback`}
                className="font-medium text-text-secondary underline-offset-2 hover:underline"
              >
                {project.name}
              </Link>
            )}
            {f.selectedElements && f.selectedElements.length > 0 && (
              <span
                className="inline-flex max-w-full items-baseline gap-1 truncate"
                title={f.selectedElements.map((el) => el.selector).join("\n")}
              >
                <span className="font-mono text-micro">
                  {f.selectedElements.length > 1
                    ? `${f.selectedElements.length} elements`
                    : f.selectedElements[0].elementType || "element"}
                </span>
                {f.selectedElements.length === 1 && f.selectedElements[0].elementText && (
                  <span className="truncate">
                    “
                    {f.selectedElements[0].elementText.length > 48
                      ? `${f.selectedElements[0].elementText.slice(0, 48)}…`
                      : f.selectedElements[0].elementText}
                    ”
                  </span>
                )}
              </span>
            )}
            <span className="text-text-muted">{meta.join(" · ")}</span>
          </p>
          {/* The phase's sentence only when it changes what the reader does
              next: a failure or a stall. "Agent is generating…" is what the
              Working badge already says. */}
          {failed && work.detail && (
            <p className="mt-1 text-xs text-text-secondary">{work.detail}</p>
          )}
          {/* The run's raw error, opened on purpose rather than printed at the
            reader. It used to be the detail line itself, which is how an
            engineer's note ("...acked verified:false and never started")
            ended up addressed to whoever filed the feedback. */}
          {failed && work.diagnostic && (
            <details className="mt-0.5">
              <summary className="cursor-pointer text-micro text-text-muted hover:text-text-secondary">
                Technical details
              </summary>
              <p className="mt-1 whitespace-pre-wrap break-words font-mono text-micro text-text-muted">
                {work.diagnostic}
              </p>
            </details>
          )}
          {f.hasScreenshots && <ScreenshotsThumbnails feedbackId={f.id} />}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED ? (
            <>
              <button
                type="button"
                onClick={() => onDispatch()}
                disabled={busy}
                className="ui-btn-save gap-1.5"
                title="Ask the agent to fix this"
              >
                {busy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
                Implement
              </button>
              <button
                type="button"
                onClick={() => setNoteOpen((v) => !v)}
                disabled={busy}
                className="ui-btn-icon"
                title="Add an instruction, then implement"
                aria-label="Add an instruction"
                aria-expanded={noteOpen}
              >
                <PenLine className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onResolve}
                disabled={busy}
                className="ui-btn-icon"
                title="Mark resolved"
                aria-label="Mark resolved"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
          ) : work.phase === FEEDBACK_WORK_PHASE.QUEUED ||
            work.phase === FEEDBACK_WORK_PHASE.WORKING ? (
            <>
              <a href={progressHref} className="ui-btn-save gap-1" title={progressTitle}>
                {progressLabel}
              </a>
              <button
                type="button"
                onClick={onResolve}
                disabled={busy}
                className="ui-btn-secondary gap-1"
                title="Mark resolved"
              >
                <Check className="h-3 w-3" /> Resolve
              </button>
            </>
          ) : work.phase === FEEDBACK_WORK_PHASE.STUCK ||
            work.phase === FEEDBACK_WORK_PHASE.FAILED ? (
            <>
              <a href={progressHref} className="ui-btn-secondary gap-1" title={progressTitle}>
                {progressLabel}
              </a>
              <button
                type="button"
                onClick={() => onDispatch()}
                disabled={busy}
                className="ui-btn-save gap-1.5"
                title="Queue again"
              >
                {busy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
                Retry
              </button>
              <button
                type="button"
                onClick={onResolve}
                disabled={busy}
                className="ui-btn-icon"
                title="Mark resolved"
                aria-label="Mark resolved"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
          ) : work.phase === FEEDBACK_WORK_PHASE.NEEDS_VERIFY ? (
            <>
              {livePageHref ? (
                <a
                  href={livePageHref}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-btn-save gap-1"
                  title="Open the reported page and confirm the live UI changed"
                >
                  Check live
                </a>
              ) : (
                <a href={progressHref} className="ui-btn-secondary gap-1" title={progressTitle}>
                  {progressLabel}
                </a>
              )}
              <button
                type="button"
                onClick={onResolve}
                disabled={busy}
                className="ui-btn-secondary gap-1"
                title="Mark resolved after you confirmed the live product"
              >
                <Check className="h-3 w-3" /> Resolve
              </button>
            </>
          ) : f.status === FEEDBACK_STATUS.RESOLVED ? (
            <>
              <button
                type="button"
                onClick={onFeature}
                disabled={busy}
                className="ui-btn-icon"
                title={
                  f.featuredAt
                    ? "Remove from the public 'shipped thanks to feedback' strip"
                    : "Feature on the public 'shipped thanks to feedback' strip"
                }
                aria-label={f.featuredAt ? "Unfeature" : "Feature publicly"}
                aria-pressed={!!f.featuredAt}
              >
                <Star className="h-3.5 w-3.5" fill={f.featuredAt ? "currentColor" : "none"} />
              </button>
            </>
          ) : null}
          {f.status === FEEDBACK_STATUS.RESOLVED ? (
            <button
              type="button"
              onClick={onReopen}
              disabled={busy}
              className="ui-btn-icon"
              title="Reopen"
              aria-label="Reopen"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onArchive}
              disabled={busy}
              className="ui-btn-icon"
              title="Archive"
              aria-label="Archive"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {noteOpen && work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Instruction for the agent, e.g. 'only fix the mobile layout'"
            className="ui-input-compact flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && note.trim()) onDispatch(note.trim());
            }}
          />
          <button
            type="button"
            onClick={() => onDispatch(note.trim() || undefined)}
            disabled={busy}
            className="ui-btn-save gap-1.5"
          >
            {busy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
            Implement
          </button>
        </div>
      )}
    </div>
  );
}

function ScreenshotsThumbnails({ feedbackId }: { feedbackId: string }) {
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/feedback/${feedbackId}/screenshot`)
      .then((res) => res.json())
      .then((data: { screenshots?: string[] }) => {
        setScreenshots(data.screenshots ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [feedbackId]);

  if (loading) return null;
  if (screenshots.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-2 pl-4">
      {screenshots.map((dataUrl, i) => (
        <a
          key={i}
          href={dataUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block"
          title={`Screenshot ${i + 1} of ${screenshots.length}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from API */}
          <img
            src={dataUrl}
            alt={`Visitor screenshot ${i + 1}`}
            className="h-14 w-auto rounded-md border border-border-subtle"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}
