"use client";

import { useState } from "react";
import { Archive, Check, Code2, Copy, Layers, Loader2, MessageSquare, Pause, PenLine, Play, RefreshCw, Rocket, ScanEye, Undo2, X } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useClipboard } from "@/hooks/use-clipboard";
import { deleteJson, patchJson, postJson, throwApiError } from "@/lib/api/fetch";
import { compactRelativeDate } from "@/lib/dates";
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";
import type { SiteFeedback } from "@/db/schema";

type WidgetTokenInfo = {
  token: string;
  snippet: string;
  status: string;
  origins: string[] | null;
  lastSeenAt: string | null;
  lastSeenOrigin: string | null;
};

/**
 * Visitor-feedback inbox for one project — submissions from the embeddable
 * widget (docs/architecture/feedback-widget.md). The one thing that matters
 * per row is "Dispatch fix": feedback becomes fleet work without leaving the
 * row. The empty state IS the widget setup card — discovery and activation
 * in one place.
 */
export function ProjectFeedbackSection({ projectId }: { projectId: string }) {
  const feedbackFetch = useFetch<{ feedback: SiteFeedback[] }>(`/api/projects/${projectId}/feedback`);
  const tokenFetch = useFetch<{ token: WidgetTokenInfo | null }>(`/api/projects/${projectId}/widget-token`);
  const [setupOpen, setSetupOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesized, setSynthesized] = useState(false);

  const items = (feedbackFetch.data?.feedback ?? []).filter(
    (f) => f.status !== FEEDBACK_STATUS.ARCHIVED,
  );
  const newCount = items.filter((f) => f.status === FEEDBACK_STATUS.NEW).length;
  const token = tokenFetch.data?.token ?? null;
  const showSetup = setupOpen || (!tokenFetch.loading && !token);

  async function act(id: string, run: () => Promise<Response>, fallback: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await run();
      if (!res.ok) await throwApiError(res, fallback);
      feedbackFetch.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  const dispatchFix = (id: string, note?: string) =>
    act(id, () => postJson(`/api/feedback/${id}/dispatch`, note ? { note } : {}), "Dispatch failed");

  // High-volume inbox: shift the unit of action from item to theme. An agent
  // clusters the NEW items into briefs and files them back into this inbox.
  async function synthesize() {
    setSynthesizing(true);
    setError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/feedback/synthesize`, {});
      if (!res.ok) await throwApiError(res, "Synthesize failed");
      setSynthesized(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Synthesize failed");
    } finally {
      setSynthesizing(false);
    }
  }
  const setStatus = (id: string, status: FeedbackStatus) =>
    act(id, () => patchJson(`/api/feedback/${id}`, { status }), "Update failed");

  return (
    <section id="feedback" className="scroll-mt-28 border-t border-border-subtle pt-7" aria-labelledby="project-feedback-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="project-feedback-title" className="text-lg font-semibold text-text-primary">
            Visitor feedback
          </h2>
          {newCount > 0 && <span className="ui-badge">{newCount} new</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {token && newCount >= 5 && (
            <button
              type="button"
              onClick={synthesize}
              disabled={synthesizing || synthesized}
              className="ui-btn-secondary gap-1.5"
              title="Dispatch an agent to cluster the new items into structured briefs, filed back into this inbox"
            >
              {synthesizing ? <Loader2 className="ui-spinner-xs" /> : <Layers className="h-3.5 w-3.5" />}
              {synthesized ? "Synthesis dispatched" : "Synthesize"}
            </button>
          )}
          {token && (
            <button type="button" onClick={() => setReviewOpen((v) => !v)} className="ui-btn-secondary gap-1.5" title="Dispatch an agent to visually review a page and file findings here">
              <ScanEye className="h-3.5 w-3.5" />
              AI review
            </button>
          )}
          <button type="button" onClick={() => setSetupOpen((v) => !v)} className="ui-btn-secondary gap-1.5">
            <Code2 className="h-3.5 w-3.5" />
            Widget
          </button>
        </div>
      </div>

      {reviewOpen && token && (
        <AiReviewCard
          projectId={projectId}
          defaultUrl={items.find((f) => f.url)?.url ?? ""}
          onClose={() => setReviewOpen(false)}
        />
      )}

      {showSetup && (
        <WidgetSetupCard
          projectId={projectId}
          token={token}
          loading={tokenFetch.loading}
          onChanged={() => {
            // Keep the card open across the refetch — right after "Enable
            // widget" the whole point is showing the snippet to copy.
            setSetupOpen(true);
            tokenFetch.refetch();
          }}
          onClose={token ? () => setSetupOpen(false) : undefined}
        />
      )}

      {error && <p className="mb-3 ui-error">{error}</p>}

      {feedbackFetch.loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-text-tertiary">
          <Loader2 className="ui-spinner-xs" /> Loading feedback…
        </div>
      ) : items.length === 0 ? (
        token && (
          <p className="py-4 text-sm text-text-muted">
            No feedback yet. Once the widget is on your site, visitor submissions land here.
          </p>
        )
      ) : (
        <div className="divide-y divide-border-subtle">
          {items.map((f) => (
            <FeedbackRow
              key={f.id}
              feedback={f}
              busy={busyId === f.id}
              onDispatch={(note) => dispatchFix(f.id, note)}
              onResolve={() => setStatus(f.id, FEEDBACK_STATUS.RESOLVED)}
              onArchive={() => setStatus(f.id, FEEDBACK_STATUS.ARCHIVED)}
              onReopen={() => setStatus(f.id, FEEDBACK_STATUS.NEW)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FeedbackRow({
  feedback: f,
  busy,
  onDispatch,
  onResolve,
  onArchive,
  onReopen,
}: {
  feedback: SiteFeedback;
  busy: boolean;
  onDispatch: (note?: string) => void;
  onResolve: () => void;
  onArchive: () => void;
  onReopen: () => void;
}) {
  // "Comment then implement" without a comment thread: the note IS an edit to
  // the dispatch prompt. Plain Dispatch stays one-click.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const meta = [
    f.page || f.url,
    f.scope,
    f.contact,
    compactRelativeDate(f.createdAt),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span
            className={
              f.status === FEEDBACK_STATUS.NEW
                ? "ui-dot-warning mt-1.5"
                : f.status === FEEDBACK_STATUS.RESOLVED
                  ? "ui-dot-positive mt-1.5"
                  : "ui-dot-neutral mt-1.5"
            }
            aria-label={`Status: ${f.status}`}
          />
          <p className="text-sm leading-relaxed text-text-primary">{f.suggestion}</p>
        </div>
        <p className="mt-1 pl-4 text-xs text-text-tertiary">{meta.join(" · ")}</p>
        {f.selectedElements && f.selectedElements.length > 0 && (
          <p className="mt-0.5 truncate pl-4 font-mono text-micro text-text-muted">
            {f.selectedElements.map((el) => el.selector).join("  ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pl-4 sm:pl-0">
        {f.status === FEEDBACK_STATUS.DISPATCHED ? (
          <>
            <span className="ui-tag">dispatched</span>
            <button type="button" onClick={onResolve} disabled={busy} className="ui-btn-secondary gap-1" title="Mark resolved">
              <Check className="h-3 w-3" /> Resolve
            </button>
          </>
        ) : f.status === FEEDBACK_STATUS.RESOLVED ? (
          <span className="ui-tag-positive">resolved</span>
        ) : (
          <>
            <button type="button" onClick={() => onDispatch()} disabled={busy} className="ui-btn-save gap-1.5" title="Send to an agent as a fix task">
              {busy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
              Dispatch fix
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              disabled={busy}
              className="ui-btn-icon"
              title="Add an instruction to the dispatch"
              aria-label="Add an instruction to the dispatch"
              aria-expanded={noteOpen}
            >
              <PenLine className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onResolve} disabled={busy} className="ui-btn-icon" title="Mark resolved" aria-label="Mark resolved">
              <Check className="h-3.5 w-3.5" />
            </button>
          </>
        )}
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
      {noteOpen && f.status !== FEEDBACK_STATUS.DISPATCHED && f.status !== FEEDBACK_STATUS.RESOLVED && (
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
            Dispatch
          </button>
        </div>
      )}
    </div>
  );
}

function WidgetSetupCard({
  projectId,
  token,
  loading,
  onChanged,
  onClose,
}: {
  projectId: string;
  token: WidgetTokenInfo | null;
  loading: boolean;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useClipboard();

  async function mutate(run: () => Promise<Response>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await run();
      if (!res.ok) await throwApiError(res, fallback);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const create = () => mutate(() => postJson(`/api/projects/${projectId}/widget-token`, {}), "Could not create widget token");
  const rotate = () => mutate(() => postJson(`/api/projects/${projectId}/widget-token`, { rotate: true }), "Could not rotate widget token");
  const revoke = () => mutate(() => deleteJson(`/api/projects/${projectId}/widget-token`), "Could not disable widget");
  const setTokenStatus = (status: "active" | "paused") =>
    mutate(() => postJson(`/api/projects/${projectId}/widget-token`, { status }), "Could not update widget");

  const paused = token?.status === "paused";

  return (
    <div className="ui-card-shell mb-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <MessageSquare className="h-4 w-4" />
            Feedback widget
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            One script tag on your site adds a feedback button — visitors can point at the exact
            element that&apos;s broken, and submissions land in this inbox ready to dispatch.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="ui-btn-icon" aria-label="Close widget setup">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-tertiary">
          <Loader2 className="ui-spinner-xs" /> Loading…
        </div>
      ) : token ? (
        <>
          <WidgetLiveStatus token={token} paused={paused} />
          <div className="mt-3 overflow-x-auto rounded-lg border border-border-subtle bg-surface-base p-3">
            <code className="whitespace-pre font-mono text-micro text-text-secondary">{token.snippet}</code>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => copy(token.snippet)} className="ui-btn-save gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy snippet"}
            </button>
            <button
              type="button"
              onClick={() => setTokenStatus(paused ? "active" : "paused")}
              disabled={busy}
              className="ui-btn-secondary gap-1.5"
              title={paused ? "Show the widget on your site again" : "Hide the widget on your site instantly — no deploy needed"}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={rotate} disabled={busy} className="ui-btn-secondary gap-1.5" title="Mint a new token; the old snippet stops working">
              <RefreshCw className="h-3.5 w-3.5" /> Rotate
            </button>
            <button type="button" onClick={revoke} disabled={busy} className="ui-btn-danger">
              Disable
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <button type="button" onClick={create} disabled={busy} className="ui-btn-save gap-1.5">
            {busy ? <Loader2 className="ui-spinner-xs" /> : <Code2 className="h-3.5 w-3.5" />}
            Enable widget
          </button>
        </div>
      )}
      {error && <p className="mt-2 ui-error">{error}</p>}
    </div>
  );
}

/**
 * Observed truth only: "Live" means the widget's boot heartbeat actually
 * arrived from the site — never that we handed out a snippet. Every state
 * names its one next action.
 */
function WidgetLiveStatus({ token, paused }: { token: WidgetTokenInfo; paused: boolean }) {
  const site = token.lastSeenOrigin ?? token.origins?.[0] ?? null;
  if (paused) {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
        <span className="ui-dot-warning" aria-hidden="true" />
        Paused — the widget is hidden on your site. Resume to show it again.
      </p>
    );
  }
  if (!token.lastSeenAt) {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
        <span className="ui-dot-warning" aria-hidden="true" />
        Waiting for the first page load{site ? ` on ${site}` : ""} — add the snippet below to your site.
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
      <span className="ui-dot-positive" aria-hidden="true" />
      Live{site ? ` on ${site}` : ""} · last seen {compactRelativeDate(new Date(token.lastSeenAt))}
    </p>
  );
}

function AiReviewCard({
  projectId,
  defaultUrl,
  onClose,
}: {
  projectId: string;
  defaultUrl: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [busy, setBusy] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dispatchReview() {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/feedback/ai-review`, { url });
      if (!res.ok) await throwApiError(res, "Could not dispatch the review");
      setDispatched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not dispatch the review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-card-shell mb-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <ScanEye className="h-4 w-4" />
            AI page review
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            An agent opens the page in a headless browser, reviews it on desktop and mobile,
            and files each issue into this inbox — you triage and dispatch fixes as usual.
          </p>
        </div>
        <button type="button" onClick={onClose} className="ui-btn-icon" aria-label="Close AI review">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {dispatched ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-text-secondary">
          <Check className="h-3.5 w-3.5" />
          Review dispatched — findings land here when the agent finishes.
        </p>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void dispatchReview();
          }}
        >
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-site.com/page-to-review"
            className="ui-input-compact min-w-0 flex-1 basis-56"
            aria-label="Page URL to review"
          />
          <button type="submit" disabled={busy || !url} className="ui-btn-save gap-1.5">
            {busy ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
            Review
          </button>
        </form>
      )}
      {error && <p className="mt-2 ui-error">{error}</p>}
    </div>
  );
}
