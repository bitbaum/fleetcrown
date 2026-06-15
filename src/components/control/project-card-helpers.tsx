"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { secondsAgo } from "@/lib/dates";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";
import type { ProjectState } from "@/lib/control-types";

export function ClosedBanner({
  session,
  onContinue,
  onDismiss,
}: {
  session: ProjectState["session"];
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-status-positive/20 bg-status-positive/[0.05] px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-status-positive shrink-0" />
        <span className="text-base font-medium text-status-positive">Session closed</span>
      </div>

      {session && (
        <div className="grid gap-3 md:grid-cols-2">
          {session.done && (
            <div className="ui-control-summary-card bg-status-positive/[0.06]">
              <p className="ui-kicker">Agent-reported completed</p>
              <p className="text-base text-text-primary leading-relaxed">{session.done}</p>
            </div>
          )}
          {session.next && (
            <div className="ui-control-summary-card bg-status-positive/[0.03]">
              <p className="ui-kicker">Agent-reported next</p>
              <p className="text-base text-text-secondary leading-relaxed">{session.next}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onContinue}
          className="flex-1 rounded-2xl bg-surface-overlay px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-raised"
        >
          Continue →
        </button>
        <button
          onClick={onDismiss}
          className="rounded-2xl px-4 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function ClosingBanner({ startedAt }: { startedAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="border-t border-status-warning/20 bg-status-warning/[0.04] px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="ui-spinner-sm text-status-warning" />
        <span className="text-sm font-medium text-status-warning">Closing session…</span>
        <span className="ml-auto text-sm text-text-secondary">{secondsAgo(startedAt)} running</span>
      </div>
    </div>
  );
}

export function RunningBanner({ label, promptKey, startedAt }: { label: string; promptKey: string; startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor(Date.now() / 1000) - startedAt);
  // Click-to-expand: the prompt label is truncated by default (1 line for
  // canned prompts, 3 lines for custom) so cards stay scannable. The
  // browser title="" tooltip wasn't surfacing long prompts well; clicking
  // the label now toggles full-text display so the user can read what the
  // agent is actually working on without leaving the card.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor(Date.now() / 1000) - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsedStr = elapsed >= 3600
    ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
    : elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  const timerClass = elapsed > 900 ? "text-status-warning" : "text-text-muted";
  const isCustom = promptKey === "custom";

  // Truncation classes differ per prompt kind; clearing them when expanded
  // lets the full text render with whitespace preserved.
  const truncatedClass = isCustom
    ? "mt-0.5 line-clamp-3 text-xs leading-relaxed text-text-secondary"
    : "truncate text-sm font-medium text-text-primary";
  const expandedClass = isCustom
    ? "mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary"
    : "whitespace-pre-wrap break-words text-sm font-medium text-text-primary";

  return (
    <div className="border-t border-accent-primary/25 bg-accent-primary/[0.05] px-5 py-3.5">
      <div className="flex items-start gap-2.5">
        <Loader2 className="ui-spinner-sm mt-[3px] text-accent-text shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-micro font-semibold uppercase tracking-caps text-accent-text/60">
            Working
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-2 text-accent-text/60 hover:text-accent-text underline-offset-2 hover:underline"
              aria-label={expanded ? "Collapse prompt" : "Show full prompt"}
            >
              {expanded ? "less" : "more"}
            </button>
          </p>
          <p
            className={cn("cursor-pointer", expanded ? expandedClass : truncatedClass)}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Click to collapse" : "Click to expand"}
          >
            {label}
          </p>
        </div>
        <span className={cn("shrink-0 pt-[3px] text-xs tabular-nums", timerClass)}>{elapsedStr}</span>
      </div>
    </div>
  );
}

const RUN_STATE_TAG: Record<string, string> = {
  done:    "ui-tag ui-tag-positive",
  error:   "ui-tag ui-tag-negative",
  running: "ui-tag ui-tag-warning",
};

// A run row left in "running" with no terminal write (agent crashed / killed
// before the finish hook fired) used to render here as a live-looking
// "running" warning tag for up to an hour. This panel is the "previous"
// (finished) run — a genuinely-live run shows in the project header instead —
// so a "running" row older than this cap is treated as interrupted.
const STALE_RUNNING_MS = 30 * 60 * 1000;

export function LatestOrchestrationPanel({
  run,
  nowMs,
}: {
  run: NonNullable<ProjectState["latestOrchestrationRun"]>;
  /** Current time in ms, passed from the parent so this render stays pure. */
  nowMs: number;
}) {
  const startedMs = run.startedAt ? Date.parse(run.startedAt) : 0;
  const staleRunning =
    run.state === "running" && startedMs > 0 && nowMs - startedMs > STALE_RUNNING_MS;
  const displayState = staleRunning ? "interrupted" : run.state;
  const stateClass = staleRunning
    ? "ui-tag ui-tag-neutral"
    : RUN_STATE_TAG[run.state] ?? "ui-tag ui-tag-neutral";
  const [expanded, setExpanded] = useState(false);
  const hasSummary = Boolean(run.summary?.done || run.summary?.next);
  const fallbackText = run.payload?.resultText?.trim() ?? "";

  const shorten = (value: string, max = 180) => {
    if (value.length <= max) return value;
    return `${value.slice(0, max).trimEnd()}…`;
  };

  const summaryDone = run.summary?.done?.trim() ?? "";
  const summaryNext = run.summary?.next?.trim() ?? "";
  const resultText = expanded ? fallbackText : shorten(fallbackText, 220);

  return (
    <div className="space-y-2.5 ui-card-section">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-kicker" title="Previous automated run. Live terminal state is shown in the project header.">
          Previous automated run
        </span>
        <span className="ui-tag ui-tag-neutral">{getAdapterLabel(run.adapter)} · {getIntentLabel(run.intent)}</span>
        <span className={stateClass}>{displayState}</span>
      </div>

      {summaryNext && (
        <div className="space-y-1">
          <p className="ui-kicker">next</p>
          <p className="text-sm leading-snug text-text-primary">{summaryNext}</p>
        </div>
      )}

      {summaryDone && (
        <div className="space-y-1">
          <p className="ui-kicker">completed</p>
          <p className="text-sm leading-relaxed text-text-secondary">{summaryDone}</p>
        </div>
      )}

      {!hasSummary && fallbackText && (
        <div className="space-y-1">
          <p className="ui-kicker">result</p>
          <p className="text-sm leading-relaxed text-text-secondary">{resultText}</p>
          {fallbackText.length > 220 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="ui-link-subtle text-xs"
            >
              {expanded ? "Show less" : "Show full result"}
            </button>
          )}
        </div>
      )}

      {run.payload?.error && (
        <p className="ui-error">{run.payload.error}</p>
      )}
    </div>
  );
}
