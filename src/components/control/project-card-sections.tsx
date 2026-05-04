"use client";

import { useState } from "react";
import {
  GitBranch, Circle, Terminal, ExternalLink,
  Pause, Play, Eraser, Loader2, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { PRIMARY_INTENTS, ACTION_INTENTS, MORE_INTENTS } from "@/config/control-intents";
import type { ProjectState, PromptMeta } from "@/app/api/control/route";
import {
  SessionBadge, ClosedBanner, ClosingBanner, RunningBanner, ReadyBanner,
} from "./project-card-helpers";

export function ProjectCardHeader({
  project,
  tabOpen,
  isClosed,
  isReady,
  isOrchReady,
}: {
  project: ProjectState;
  tabOpen: boolean;
  isClosed: boolean;
  isReady: boolean;
  isOrchReady: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const { git, session, profile } = project;

  return (
    <div className="flex flex-col gap-3 p-5 pb-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        <Circle
          className={cn(
            "h-3 w-3 shrink-0 fill-current",
            project.agentRunning
              ? "text-accent-text animate-pulse"
              : isClosed || isReady || isOrchReady
              ? "text-status-positive"
              : "text-text-muted"
          )}
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="break-words text-lg sm:text-xl md:text-2xl font-medium text-text-primary">
            {project.tab}
          </span>
          {tabOpen && <Terminal className="h-4 w-4 text-text-muted shrink-0" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session?.health && <SessionBadge health={session.health} />}
          {profile?.status && !session?.health && (
            <span className="text-sm text-text-secondary">{profile.status}</span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-3 lg:shrink-0 lg:self-start">
        {git && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm text-text-secondary">
              <GitBranch className="h-4 w-4" />
              <span className="max-w-[20rem] truncate" title={git.branch}>{git.branch}</span>
              {git.dirty && <span className="text-status-warning">✎</span>}
              {git.todayCount > 0 && <span className="text-status-positive/70">+{git.todayCount}</span>}
            </div>
            {git.behindRemote > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="ui-tag ui-tag-warning">
                  ↓ {git.behindRemote} behind
                </span>
                <button
                  onClick={async () => {
                    setSyncing(true);
                    setSyncResult(null);
                    try {
                      const res = await postJson("/api/project/sync", { dir: project.dir });
                      const data = await res.json();
                      setSyncResult(res.ok ? "Synced ✓" : (data.error ?? "Failed"));
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  disabled={syncing}
                  className="text-xs text-status-warning transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  {syncing ? "Pulling…" : "git pull"}
                </button>
                {syncResult && <span className="text-xs text-text-muted">{syncResult}</span>}
              </div>
            )}
          </div>
        )}
        {profile?.url && (
          <a
            href={profile.url.startsWith("http") ? profile.url : `https://${profile.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted transition-colors hover:text-text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

export function SessionSummary({
  session,
  git,
  isClosed,
}: {
  session: ProjectState["session"];
  git: ProjectState["git"];
  isClosed: boolean;
}) {
  if (isClosed || (!session && !git)) return null;
  return (
    <div className="space-y-3 ui-card-section">
      {session?.done && (
        <p className="line-clamp-3 text-base text-text-secondary">
          <span className="mr-2 ui-kicker">done</span>{session.done}
        </p>
      )}
      {session?.next && (
        <p className="line-clamp-3 text-lg sm:text-xl text-text-primary leading-snug">
          <span className="mr-2 ui-kicker">next</span>{session.next}
        </p>
      )}
      {(session?.tests || session?.todos) && (
        <p className="text-sm text-text-tertiary">
          {[session.tests, session.todos].filter(Boolean).join(" · ")}
        </p>
      )}
      {git?.recentCommits && git.recentCommits.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {git.recentCommits.slice(0, 4).map((c, i) => {
            const spaceIdx = c.indexOf(" ");
            const hash = c.slice(0, spaceIdx);
            const desc = c.slice(spaceIdx + 1);
            return (
              <p key={i} className="truncate font-mono text-sm text-text-tertiary/90">
                <span className="mr-1 text-text-muted">{hash}</span>
                {desc}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProjectBanners({
  isClosed,
  isClosing,
  isReady,
  isOrchReady,
  showRunning,
  session,
  git,
  closingAt,
  currentPrompt,
  prompts,
  autoContinueEnabled,
  paused,
  onDismiss,
  onSend,
}: {
  isClosed: boolean;
  isClosing: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  showRunning: boolean;
  session: ProjectState["session"];
  git: ProjectState["git"];
  closingAt: number | null;
  currentPrompt: ProjectState["currentPrompt"];
  prompts: PromptMeta[];
  autoContinueEnabled: boolean;
  paused: boolean;
  onDismiss: () => void;
  onSend: (key: string) => void;
}) {
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";

  return (
    <>
      {isClosed && (
        <ClosedBanner
          session={session}
          git={git}
          onContinue={() => onSend(primaryKey)}
          onDismiss={onDismiss}
        />
      )}
      {isClosing && <ClosingBanner startedAt={closingAt!} />}
      {isReady && (
        <ReadyBanner
          prompts={prompts}
          onSend={onSend}
          onDismiss={onDismiss}
          paused={paused}
          title="Agent finished"
          autoContinueEnabled={autoContinueEnabled}
        />
      )}
      {isOrchReady && (
        <ReadyBanner
          prompts={prompts}
          onSend={(key) => {
            const intent = mapClaudePromptToIntent(key);
            if (!intent) return;
            onSend(key);
          }}
          onDismiss={onDismiss}
          paused={paused}
          title="Task finished"
          autoContinueEnabled={autoContinueEnabled}
        />
      )}
      {showRunning && currentPrompt && (
        <RunningBanner label={currentPrompt.label} startedAt={currentPrompt.startedAt} />
      )}
    </>
  );
}

export function IntentButtonPanel({
  project,
  currentAdapter,
  autoContinueEnabled,
  sending,
  custom,
  onToggleAutoContinue,
  onSendIntent,
  onSendCustom,
  onCustomChange,
  onCustomFocusChange,
}: {
  project: ProjectState;
  currentAdapter: string;
  autoContinueEnabled: boolean;
  sending: string | null;
  custom: string;
  onToggleAutoContinue: () => void;
  onSendIntent: (intent: OrchestrationTaskIntentId) => void;
  onSendCustom: () => void;
  onCustomChange: (value: string) => void;
  onCustomFocusChange: (focused: boolean) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [clearingContext, setClearingContext] = useState(false);

  return (
    <div className="space-y-3 ui-card-section">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onToggleAutoContinue}
          title={
            autoContinueEnabled
              ? "Pause automatic continue for this tab"
              : "Resume automatic continue for this tab"
          }
          className="ui-btn-lg-outline inline-flex items-center gap-2"
        >
          {autoContinueEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
        </button>

        {PRIMARY_INTENTS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onSendIntent(id)}
            disabled={sending !== null}
            className="ui-btn-lg flex flex-col items-start"
          >
            <span>{label}</span>
            <span className="text-xs opacity-60">via {currentAdapter}</span>
          </button>
        ))}

        {ACTION_INTENTS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onSendIntent(id)}
            disabled={sending !== null}
            className="ui-btn-lg-outline"
          >
            {sending === id ? "…" : label}
          </button>
        ))}

        <button
          onClick={() => setShowMore((v) => !v)}
          className="ui-btn-lg-outline flex items-center gap-1"
        >
          {showMore ? "Less" : "More"}
          {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {showMore && (
        <div className="flex flex-wrap gap-2">
          {MORE_INTENTS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onSendIntent(id)}
              disabled={sending !== null}
              className="ui-btn-ready-more"
            >
              {sending === id ? "…" : label}
            </button>
          ))}
          {currentAdapter === "claude" && (
            <button
              onClick={async () => {
                setClearingContext(true);
                try {
                  await postJson("/api/project/clear-context", { tab: project.tab });
                } finally {
                  setClearingContext(false);
                }
              }}
              disabled={clearingContext}
              title="Send /clear to reset Claude's context window"
              className="ui-btn-ready-more flex items-center gap-1.5 hover:text-status-warning"
            >
              {clearingContext
                ? <Loader2 className="ui-spinner-sm" />
                : <Eraser className="h-3.5 w-3.5" />}
              Clear context
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && custom.trim() && onSendCustom()}
          onFocus={() => onCustomFocusChange(true)}
          onBlur={() => onCustomFocusChange(false)}
          placeholder="Custom prompt…"
          className="ui-input min-w-0 flex-1"
        />
        <button
          onClick={onSendCustom}
          disabled={!custom.trim() || sending !== null}
          className="ui-btn-lg py-3.5 sm:px-5"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {project.recentCustomPrompts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {project.recentCustomPrompts.map((r, i) => (
            <button
              key={i}
              onClick={() => onCustomChange(r.customPrompt)}
              title={r.customPrompt}
              className="max-w-[18rem] truncate rounded-xl border border-border-subtle bg-surface-overlay px-3 py-1.5 text-left text-xs text-text-tertiary transition-colors hover:border-border-default hover:text-text-secondary"
            >
              {r.count > 1 && <span className="mr-1.5 text-text-muted">×{r.count}</span>}
              {r.customPrompt.length > 60 ? r.customPrompt.slice(0, 60) + "…" : r.customPrompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
