"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, Loader2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { secondsAgo } from "@/lib/dates";
import { HEALTH_COLOR, PROMPT_STYLE, AUTO_INJECT_S } from "@/lib/constants/control";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";
import type { ProjectState, PromptMeta } from "@/app/api/control/route";

export function SessionBadge({ health }: { health: string }) {
  const color = HEALTH_COLOR[health] ?? "text-text-tertiary";
  return <span className={cn("rounded-full border border-border-default bg-surface-overlay px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em]", color)}>{health}</span>;
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
        <div className="space-y-2">
          {session.done && (
            <div className="space-y-0.5">
              <p className="ui-kicker">Shipped</p>
              <p className="text-base text-text-primary leading-relaxed">{session.done}</p>
            </div>
          )}
          {session.next && (
            <div className="space-y-0.5">
              <p className="ui-kicker">Up next</p>
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

export function RunningBanner({ label, startedAt }: { label: string; startedAt: number }) {
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

  const timerClass = elapsed > 900 ? "text-status-warning" : "text-text-secondary";

  return (
    <div className="border-t border-accent-primary/25 bg-accent-primary/[0.05] px-5 py-3.5">
      <div className="flex items-center gap-2">
        <Loader2 className="ui-spinner-sm text-accent-text shrink-0" />
        <span className="truncate text-sm font-medium text-accent-text" title={label}>{label}</span>
        <span className={cn("ml-auto shrink-0 text-sm tabular-nums", timerClass)}>{elapsedStr}</span>
      </div>
    </div>
  );
}

export function ReadyBanner({
  prompts,
  onSend,
  onDismiss,
  paused = false,
  title = "Agent finished",
  autoContinueEnabled = true,
}: {
  prompts: PromptMeta[];
  onSend: (key: string) => void;
  onDismiss: () => void;
  paused?: boolean;
  title?: string;
  autoContinueEnabled?: boolean;
}) {
  const [seconds, setSeconds] = useState(AUTO_INJECT_S);
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";

  useEffect(() => {
    if (paused || !autoContinueEnabled) return;
    if (seconds <= 0) { onSend(primaryKey); return; }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, paused, autoContinueEnabled, onSend, primaryKey]);

  return (
    <div className="border-t border-status-positive/30 bg-status-positive/[0.06] px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-status-positive" />
          <span className="text-sm font-medium text-status-positive">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary tabular-nums">{!autoContinueEnabled ? "Off" : paused ? "Paused" : `${seconds}s`}</span>
          <button onClick={onDismiss} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
            dismiss
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
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
  return (
    <div className="space-y-2.5 ui-card-section">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-kicker">last run</span>
        <span className="ui-tag ui-tag-neutral">{getAdapterLabel(run.adapter)} · {getIntentLabel(run.intent)}</span>
        <span className={stateClass}>{run.state}</span>
      </div>
      {run.summary?.done && (
        <p className="text-sm text-text-secondary leading-relaxed">
          <span className="mr-1.5 ui-kicker">done</span>{run.summary.done}
        </p>
      )}
      {run.summary?.next && (
        <p className="text-sm text-text-primary leading-snug">
          <span className="mr-1.5 ui-kicker">next</span>{run.summary.next}
        </p>
      )}
      {!run.summary && run.payload?.resultText && (
        <p className="text-sm text-text-secondary leading-relaxed">{run.payload.resultText}</p>
      )}
      {run.payload?.error && (
        <p className="text-sm text-status-negative">{run.payload.error}</p>
      )}
    </div>
  );
}

