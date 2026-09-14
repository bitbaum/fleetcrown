"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, Check, Loader2, PenLine, Rocket, Star, Undo2 } from "lucide-react";
import { compactRelativeDate } from "@/lib/dates";
import { FEEDBACK_SOURCE, FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { deriveFeedbackWork, FEEDBACK_WORK_PHASE } from "@/lib/feedback/work-phase";
import type { FeedbackListItem } from "@/db/queries/site-feedback";
import type { FeedbackListItemWithWork } from "@/lib/feedback/attach-work";
import { FeedbackWorkBadge } from "@/components/feedback/FeedbackWorkBadge";
import { RowActions } from "@/components/ui/row-actions";
import { fleetSurfaceHref } from "@/lib/fleet-context";
import { livePageHref } from "@/lib/feedback/fix-shipping";
import { cn } from "@/lib/utils";

/**
 * One feedback item, everywhere feedback renders: the per-project section and
 * the cross-project /feedback inbox.
 *
 * Shape of the card, top to bottom — each fragment labeled by placement:
 *
 *   1. The report, clamped to three lines. A dictated report runs 100–200
 *      words, and unclamped it filled a phone screen per row, so the reader
 *      scrolled through prose to find the one row that needed them. Three
 *      lines answer "what is this about"; the full text is one tap away.
 *   2. One context line: status badge · project · element · page · who · when.
 *   3. The phase's sentence, only when it changes what the reader does next.
 *   4. The action rail: ONE filled button for the next move, at most one
 *      outlined alternative, and everything else behind ⋯. Four visible
 *      controls per row, on a page of twelve rows, was forty-eight buttons
 *      competing with the reports — and the check-mark meant "resolve" on
 *      one row while a labeled "Resolve" sat on the next.
 */
export function FeedbackItemRow({
  feedback: f,
  projectName,
  project,
  busy,
  error,
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
  /** The last action on THIS row failed with this message. */
  error?: string | null;
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
  // Terminal when there is a PTY to look at (the prompt reached an agent),
  // Control when there is not — Terminal is empty until a session exists.
  const watchLive = work.watchable === true;
  const progressHref = watchLive ? terminalHref : controlHref;
  const progressLabel = watchLive ? "Watch" : "Open on Control";
  const progressTitle = watchLive
    ? (work.detail ?? "Open the agent's terminal")
    : "Open this project on Control — Terminal is empty until a session is actually running";
  // Somewhere for an agent to work. Rows from the per-project inbox carry no
  // flag and keep the one-click Implement; the server refuses the same case.
  const runnable = "runnable" in f ? f.runnable !== false : true;
  const projectHref = `/projects/${f.projectId}`;
  // The live page: the project's public origin plus the reported path. The
  // visitor's host is only a fallback — they may have reported from a preview.
  const liveHref = livePageHref("liveUrl" in f ? f.liveUrl : null, f.url, f.page);
  const ship = work.ship ?? null;
  const showCheckLive = work.checkLive === true && !!liveHref;
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
  const archived = f.status === FEEDBACK_STATUS.ARCHIVED;
  const resolved = f.status === FEEDBACK_STATUS.RESOLVED;
  // The badge is the status; a "Not started" chip on every untouched report
  // said nothing the Implement button did not.
  const showBadge = work.phase !== FEEDBACK_WORK_PHASE.NOT_STARTED;
  const badge = showCheckLive ? (
    <a
      href={liveHref!}
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

  const spinnerOr = (icon: React.ReactNode) =>
    busy ? <Loader2 className="ui-spinner-xs" /> : icon;

  return (
    <div className={cn("ui-feedback-item", archived && "opacity-70")}>
      <div className="min-w-0">
        <ClampedMessage text={f.suggestion} />
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
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
        {(failed ||
          work.phase === FEEDBACK_WORK_PHASE.WORKING ||
          work.phase === FEEDBACK_WORK_PHASE.NEEDS_VERIFY) &&
          work.detail && (
            <p
              className={cn(
                "mt-1.5 text-xs leading-snug",
                failed ? "text-status-negative" : "text-text-secondary",
              )}
            >
              {work.detail}
            </p>
          )}
        {work.phase === FEEDBACK_WORK_PHASE.NEEDS_VERIFY && work.didLine && (
          <p className="mt-0.5 text-xs text-text-tertiary" title="The agent's own account">
            Agent: {work.didLine}
          </p>
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

      {/* A failed action answers on the row it happened on, in the place the
          reader is already looking — right above the button they pressed. */}
      {error && (
        <p className="ui-error-xs" role="alert">
          {error}
        </p>
      )}

      <div className="ui-feedback-actions">
        {archived ? (
          <RowActions>
            <button type="button" onClick={onReopen} disabled={busy} className="ui-menu-item">
              <Undo2 className="h-3.5 w-3.5" /> Restore
            </button>
          </RowActions>
        ) : resolved ? (
          <RowActions>
            <button
              type="button"
              onClick={onFeature}
              disabled={busy}
              className="ui-menu-item"
              aria-pressed={!!f.featuredAt}
            >
              <Star className="h-3.5 w-3.5" fill={f.featuredAt ? "currentColor" : "none"} />
              {f.featuredAt
                ? "Remove from public shipped strip"
                : "Feature on public shipped strip"}
            </button>
            <button type="button" onClick={onReopen} disabled={busy} className="ui-menu-item">
              <Undo2 className="h-3.5 w-3.5" /> Reopen
            </button>
          </RowActions>
        ) : work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED && !runnable ? (
          <>
            <Link
              href={projectHref}
              className="ui-btn-save gap-1"
              title="This project has no repository or folder yet — the agent has nowhere to work. Add a Git URL, then Implement."
            >
              Connect a repository
            </Link>
            <QuietActions busy={busy} onResolve={onResolve} onArchive={onArchive} />
          </>
        ) : work.phase === FEEDBACK_WORK_PHASE.NOT_STARTED ? (
          <>
            <button
              type="button"
              onClick={() => onDispatch()}
              disabled={busy}
              className="ui-btn-save gap-1.5"
              title="Ask the agent to fix this"
            >
              {spinnerOr(<Rocket className="h-3 w-3" />)}
              Implement
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              disabled={busy}
              className={cn("ui-btn-icon", noteOpen && "bg-surface-overlay text-text-primary")}
              title="Add an instruction, then implement"
              aria-label="Add an instruction"
              aria-expanded={noteOpen}
            >
              <PenLine className="h-3.5 w-3.5" />
            </button>
            <QuietActions busy={busy} onResolve={onResolve} onArchive={onArchive} />
          </>
        ) : work.phase === FEEDBACK_WORK_PHASE.QUEUED ||
          work.phase === FEEDBACK_WORK_PHASE.WORKING ? (
          <>
            <a href={progressHref} className="ui-btn-save gap-1" title={progressTitle}>
              {progressLabel}
            </a>
            <QuietActions busy={busy} onResolve={onResolve} onArchive={onArchive} />
          </>
        ) : failed ? (
          <>
            <button
              type="button"
              onClick={() => onDispatch()}
              disabled={busy}
              className="ui-btn-save gap-1.5"
              title="Queue again"
            >
              {spinnerOr(<Rocket className="h-3 w-3" />)}
              Retry
            </button>
            <a href={progressHref} className="ui-btn-secondary gap-1" title={progressTitle}>
              {progressLabel}
            </a>
            <QuietActions busy={busy} onResolve={onResolve} onArchive={onArchive} />
          </>
        ) : work.phase === FEEDBACK_WORK_PHASE.NEEDS_VERIFY ? (
          <>
            {showCheckLive ? (
              <a
                href={liveHref!}
                target="_blank"
                rel="noreferrer"
                className="ui-btn-save gap-1"
                title="Open the live page and confirm the visitor's point is fixed"
              >
                Check live
              </a>
            ) : ship?.pr ? (
              <a
                href={ship.pr.url}
                target="_blank"
                rel="noreferrer"
                className="ui-btn-save gap-1"
                title={ship.pr.title}
              >
                Review PR
              </a>
            ) : ship?.push ? (
              <a
                href={ship.push.url}
                target="_blank"
                rel="noreferrer"
                className="ui-btn-secondary gap-1"
                title={ship.push.title}
              >
                Open branch
              </a>
            ) : ship ? (
              <button
                type="button"
                onClick={() => onDispatch()}
                disabled={busy}
                className="ui-btn-save gap-1.5"
                title="Queue again"
              >
                {spinnerOr(<Rocket className="h-3 w-3" />)}
                Retry
              </button>
            ) : null}
            <button
              type="button"
              onClick={onResolve}
              disabled={busy}
              className="ui-btn-secondary gap-1"
              title={
                showCheckLive
                  ? "You looked at the live page and the point is fixed"
                  : "Mark resolved without a live check"
              }
            >
              <Check className="h-3 w-3" /> Confirm
            </button>
            <RowActions>
              <button type="button" onClick={onReopen} disabled={busy} className="ui-menu-item">
                <Undo2 className="h-3.5 w-3.5" /> Not fixed — reopen
              </button>
              <button type="button" onClick={onArchive} disabled={busy} className="ui-menu-item">
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
            </RowActions>
          </>
        ) : (
          <QuietActions busy={busy} onResolve={onResolve} onArchive={onArchive} />
        )}
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
            autoFocus
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
            {spinnerOr(<Rocket className="h-3 w-3" />)}
            Implement
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The two moves every open row supports but almost never needs: closing it by
 * hand, and putting it away. Behind ⋯ so the rail keeps one obvious button.
 */
function QuietActions({
  busy,
  onResolve,
  onArchive,
}: {
  busy: boolean;
  onResolve: () => void;
  onArchive: () => void;
}) {
  return (
    <RowActions>
      <button type="button" onClick={onResolve} disabled={busy} className="ui-menu-item">
        <Check className="h-3.5 w-3.5" /> Mark resolved
      </button>
      <button type="button" onClick={onArchive} disabled={busy} className="ui-menu-item">
        <Archive className="h-3.5 w-3.5" /> Archive
      </button>
    </RowActions>
  );
}

/**
 * The report text, three lines by default. The toggle appears only when the
 * clamp actually hides something — measured, not guessed from a character
 * count, because a word budget is not a height budget (see the /today nudge).
 */
function ClampedMessage({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    // Once open the box fits its text, so measuring would say "nothing
    // hidden" and take the Less button away; keep the last closed reading.
    if (open) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text]);

  return (
    <>
      <p ref={ref} className={cn("ui-feedback-message", open && "ui-feedback-message-open")}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ui-link-subtle-button -ml-1 mt-0.5"
          aria-expanded={open}
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </>
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
    <div className="mt-2 flex flex-wrap gap-2">
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
