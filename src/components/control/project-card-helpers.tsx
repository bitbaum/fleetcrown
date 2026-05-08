"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2, Loader2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { secondsAgo } from "@/lib/dates";
import { HEALTH_COLOR, PROMPT_STYLE, AUTO_INJECT_S } from "@/lib/constants/control";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";

export function SessionBadge({ health }: { health: string }) {
  // Agents write verbose health like "GOOD — deployed; all tests pass" or
  // "LINT CLEAN, BUILD CLEAN, 0 TS ERRORS". Extract first segment as badge label.
  const short = health.split(/\s*[,—–]\s*/)[0].trim();
  const color = HEALTH_COLOR[short.toLowerCase()] ?? "text-text-tertiary";
  const hasMore = short.length < health.trim().length;
  return (
    <span
      title={hasMore ? health : undefined}
      className={cn("max-w-[16rem] truncate rounded-full border border-border-default bg-surface-overlay px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em]", color)}
    >
      {short}
    </span>
  );
}


export function ClosedBanner({
  session,
  git,
  onContinue,
  onDismiss,
}: {
  session: ProjectState["session"];
  git: ProjectState["git"];
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-status-positive/20 bg-status-positive/[0.05] px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-status-positive shrink-0" />
        <span className="text-base font-medium text-status-positive">Session closed</span>
        {git?.todayCount ? (
          <span className="ml-auto text-sm text-text-secondary">+{git.todayCount} commits today</span>
        ) : null}
      </div>

      {session && (
        <div className="grid gap-3 md:grid-cols-2">
          {session.done && (
            <div className="ui-control-summary-card bg-status-positive/[0.06]">
              <p className="ui-kicker">Shipped</p>
              <p className="text-base text-text-primary leading-relaxed">{session.done}</p>
            </div>
          )}
          {session.next && (
            <div className="ui-control-summary-card bg-status-positive/[0.03]">
              <p className="ui-kicker">Agent&apos;s plan</p>
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

  return (
    <div className="border-t border-accent-primary/25 bg-accent-primary/[0.05] px-5 py-3.5">
      <div className="flex items-start gap-2.5">
        <Loader2 className="ui-spinner-sm mt-[3px] text-accent-text shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-text/60">Running</p>
          <p className="truncate text-sm font-medium text-text-primary" title={label}>
            {isCustom ? "Custom prompt" : label}
          </p>
          {isCustom && label && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-tertiary">{label}</p>
          )}
        </div>
        <span className={cn("shrink-0 pt-[3px] text-xs tabular-nums", timerClass)}>{elapsedStr}</span>
      </div>
    </div>
  );
}

export function ReadyBanner({
  prompts,
  onSend,
  onDismiss,
  onAutoInject,
  paused = false,
  title = "Agent finished",
  autoContinueEnabled = true,
  nextQueueItem,
  queueTotal = 0,
}: {
  prompts: PromptMeta[];
  onSend: (key: string) => void;
  onDismiss: () => void;
  onAutoInject?: () => void;
  paused?: boolean;
  title?: string;
  autoContinueEnabled?: boolean;
  nextQueueItem?: string;
  queueTotal?: number;
}) {
  const [seconds, setSeconds] = useState(AUTO_INJECT_S);
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";
  const onAutoInjectRef = useRef(onAutoInject);
  const onSendRef = useRef(onSend);
  useEffect(() => { onAutoInjectRef.current = onAutoInject; }, [onAutoInject]);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  // Reset countdown when a queue item arrives while banner is visible — this ensures
  // items queued from the beacon popup (which has a longer countdown than 12s) are
  // picked up on this cycle rather than stranded until the next ready event.
  const prevQueueItemRef = useRef(nextQueueItem);
  useEffect(() => {
    const wasEmpty = !prevQueueItemRef.current;
    prevQueueItemRef.current = nextQueueItem;
    if (wasEmpty && nextQueueItem) setSeconds(AUTO_INJECT_S); // eslint-disable-line react-hooks/set-state-in-effect
  }, [nextQueueItem]);

  useEffect(() => {
    if (paused || !autoContinueEnabled) return;
    if (seconds <= 0) {
      if (onAutoInjectRef.current) onAutoInjectRef.current();
      else onSendRef.current(primaryKey);
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, paused, autoContinueEnabled, primaryKey]);

  const timerLabel = !autoContinueEnabled ? "Off" : paused ? "Paused" : `${seconds}s`;

  // What actually fires when the countdown hits zero
  const nextLabel = nextQueueItem
    ? `"${nextQueueItem.length > 52 ? nextQueueItem.slice(0, 50) + "…" : nextQueueItem}"${queueTotal > 1 ? ` · +${queueTotal - 1} more` : ""}`
    : "AI picks next task";

  return (
    <div className="border-t border-status-positive/30 bg-status-positive/[0.06] px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-status-positive" />
          <span className="text-sm font-medium text-status-positive">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-muted tabular-nums">{timerLabel}</span>
          <button onClick={onDismiss} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
            dismiss
          </button>
        </div>
      </div>

      {/* Pipeline preview — what the countdown will actually fire */}
      <p className="mb-2 truncate font-mono text-xs text-text-muted">
        <span className="mr-1 text-text-muted">→</span>
        {nextLabel}
      </p>

      <div className="ui-control-intent-grid">
        {prompts.filter((p) => p.style === "primary" || p.style === "action").map((p) => (
          <button
            key={p.key}
            onClick={() => onSend(p.key)}
            className={cn(PROMPT_STYLE[p.style] ?? PROMPT_STYLE.action)}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const RUN_STATE_TAG: Record<string, string> = {
  done:    "ui-tag ui-tag-positive",
  error:   "ui-tag ui-tag-negative",
  running: "ui-tag ui-tag-warning",
};

export function LatestOrchestrationPanel({ run }: { run: NonNullable<ProjectState["latestOrchestrationRun"]> }) {
  const stateClass = RUN_STATE_TAG[run.state] ?? "ui-tag ui-tag-neutral";
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
        <span className="ui-kicker">last run</span>
        <span className="ui-tag ui-tag-neutral">{getAdapterLabel(run.adapter)} · {getIntentLabel(run.intent)}</span>
        <span className={stateClass}>{run.state}</span>
      </div>

      {summaryNext && (
        <div className="space-y-1">
          <p className="ui-kicker">next</p>
          <p className="text-sm leading-snug text-text-primary">{summaryNext}</p>
        </div>
      )}

      {summaryDone && (
        <div className="space-y-1">
          <p className="ui-kicker">done</p>
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
        <p className="text-sm text-status-negative">{run.payload.error}</p>
      )}
    </div>
  );
}
