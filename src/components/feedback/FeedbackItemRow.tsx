"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Check, Loader2, PenLine, Rocket, Star, Undo2 } from "lucide-react";
import { compactRelativeDate } from "@/lib/dates";
import { FEEDBACK_SOURCE, FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { deriveFeedbackWork, FEEDBACK_WORK_PHASE } from "@/lib/feedback/work-phase";
import type { FeedbackListItem } from "@/db/queries/site-feedback";
import type { FeedbackListItemWithWork } from "@/lib/feedback/attach-work";
import { FeedbackWorkBadge } from "@/components/feedback/FeedbackWorkBadge";
import { fleetSurfaceHref } from "@/lib/fleet-context";

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
  // Agent-filed rows get a typed badge instead of their magic contact string.
  const agentBadge =
    f.source === FEEDBACK_SOURCE.AI_REVIEW ? "AI review"
    : f.source === FEEDBACK_SOURCE.SYNTHESIZER ? "brief"
    : null;
  const meta = [
    f.page || f.url,
    f.scope,
    !agentBadge && f.contact,
    compactRelativeDate(f.createdAt),
    f.status === FEEDBACK_STATUS.RESOLVED && f.resolvedAt && `resolved ${compactRelativeDate(f.resolvedAt)}`,
    f.status === FEEDBACK_STATUS.RESOLVED && f.dispatchedRunId && `by run ${f.dispatchedRunId.slice(0, 8)}`,
  ].filter(Boolean);

  const dotClass =
    work.phase === FEEDBACK_WORK_PHASE.WORKING || work.phase === FEEDBACK_WORK_PHASE.DONE
      ? "ui-dot-positive mt-1.5"
      : work.phase === FEEDBACK_WORK_PHASE.FAILED || work.phase === FEEDBACK_WORK_PHASE.STUCK
        ? "ui-dot-negative mt-1.5"
        : work.phase === FEEDBACK_WORK_PHASE.QUEUED || work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED
          ? "ui-dot-warning mt-1.5"
          : "ui-dot-neutral mt-1.5";

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className={dotClass} aria-label={work.label} />
          <p className="min-w-0 text-sm leading-relaxed text-text-primary">{f.suggestion}</p>
          <FeedbackWorkBadge work={work} />
          {agentBadge && <span className="ui-tag shrink-0">{agentBadge}</span>}
          {f.duplicateCount > 1 && (
            <span className="ui-badge shrink-0" title={`Reported ${f.duplicateCount} times`}>×{f.duplicateCount}</span>
          )}
        </div>
        <p className="mt-1 pl-4 text-xs text-text-tertiary">
          {project && (
            <>
              <Link
                href={`/projects/${project.id}#feedback`}
                className="font-medium text-text-secondary underline-offset-2 hover:underline"
              >
                {project.name}
              </Link>
              {meta.length > 0 && " · "}
            </>
          )}
          {meta.join(" · ")}
        </p>
        {work.detail && (
          <p className="mt-0.5 pl-4 text-xs text-text-secondary">{work.detail}</p>
        )}
        {f.selectedElements && f.selectedElements.length > 0 && (
          <p className="mt-0.5 pl-4 text-xs text-text-muted">
            {f.selectedElements.map((el, i) => (
              <span key={`${el.selector}-${i}`} title={el.selector} className="mr-2 inline-flex items-baseline gap-1">
                <span className="font-mono text-micro">{el.elementType || "element"}</span>
                {el.elementText && <span>“{el.elementText.length > 60 ? `${el.elementText.slice(0, 60)}…` : el.elementText}”</span>}
              </span>
            ))}
          </p>
        )}
        {f.hasScreenshot && (
          <a
            href={`/api/feedback/${f.id}/screenshot`}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-block pl-4"
            title="Open the visitor's screenshot"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic auth'd API image, not a static asset */}
            <img
              src={`/api/feedback/${f.id}/screenshot`}
              alt="Visitor screenshot (click to open)"
              className="h-14 w-auto rounded-md border border-border-subtle"
              loading="lazy"
            />
          </a>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pl-4 sm:pl-0">
        {work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED ? (
          <>
            <button type="button" onClick={() => onDispatch()} disabled={busy} className="ui-btn-save gap-1.5" title="Ask the agent to fix this">
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
            <button type="button" onClick={onResolve} disabled={busy} className="ui-btn-icon" title="Mark resolved" aria-label="Mark resolved">
              <Check className="h-3.5 w-3.5" />
            </button>
          </>
        ) : work.phase === FEEDBACK_WORK_PHASE.QUEUED || work.phase === FEEDBACK_WORK_PHASE.WORKING ? (
          <>
            <a href={progressHref} className="ui-btn-save gap-1" title={progressTitle}>
              {progressLabel}
            </a>
            <button type="button" onClick={onResolve} disabled={busy} className="ui-btn-secondary gap-1" title="Mark resolved">
              <Check className="h-3 w-3" /> Resolve
            </button>
          </>
        ) : work.phase === FEEDBACK_WORK_PHASE.STUCK || work.phase === FEEDBACK_WORK_PHASE.FAILED ? (
          <>
            <a href={progressHref} className="ui-btn-secondary gap-1" title={progressTitle}>{progressLabel}</a>
            <button type="button" onClick={() => onDispatch()} disabled={busy} className="ui-btn-save gap-1.5" title="Queue again">
              {busy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
              Retry
            </button>
            <button type="button" onClick={onResolve} disabled={busy} className="ui-btn-icon" title="Mark resolved" aria-label="Mark resolved">
              <Check className="h-3.5 w-3.5" />
            </button>
          </>
        ) : work.phase === FEEDBACK_WORK_PHASE.DONE && f.status !== FEEDBACK_STATUS.RESOLVED ? (
          <>
            <button type="button" onClick={onResolve} disabled={busy} className="ui-btn-save gap-1">
              <Check className="h-3 w-3" /> Resolve
            </button>
            <a href={progressHref} className="ui-btn-secondary gap-1" title={progressTitle}>{progressLabel}</a>
          </>
        ) : f.status === FEEDBACK_STATUS.RESOLVED ? (
          <>
            <button
              type="button"
              onClick={onFeature}
              disabled={busy}
              className="ui-btn-icon"
              title={f.featuredAt ? "Remove from the public 'shipped thanks to feedback' strip" : "Feature on the public 'shipped thanks to feedback' strip"}
              aria-label={f.featuredAt ? "Unfeature" : "Feature publicly"}
              aria-pressed={!!f.featuredAt}
            >
              <Star className="h-3.5 w-3.5" fill={f.featuredAt ? "currentColor" : "none"} />
            </button>
          </>
        ) : null}
        {f.status === FEEDBACK_STATUS.RESOLVED ? (
          <button type="button" onClick={onReopen} disabled={busy} className="ui-btn-icon" title="Reopen" aria-label="Reopen">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button type="button" onClick={onArchive} disabled={busy} className="ui-btn-icon" title="Archive" aria-label="Archive">
            <Archive className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      </div>
      {noteOpen && work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED && (
        <div className="flex items-center gap-2 pl-4">
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
