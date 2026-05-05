"use client";

import { useState, useCallback } from "react";
import {
  GitBranch, Circle, Terminal, ExternalLink,
  Pause, Play, Eraser, Loader2, Send, Mic, MicOff,
  SlidersHorizontal, ChevronsDown,
} from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
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
  profileOpen,
  onProfileToggle,
  onCollapse,
}: {
  project: ProjectState;
  tabOpen: boolean;
  isClosed: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  profileOpen: boolean;
  onProfileToggle: () => void;
  onCollapse?: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const { git, session, profile } = project;

  const dotColor = project.agentRunning
    ? "text-accent-text animate-pulse"
    : isClosed || isReady || isOrchReady
    ? "text-status-positive"
    : "text-text-muted";

  return (
    <div className="flex min-w-0 items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Circle className={cn("h-2.5 w-2.5 shrink-0 fill-current", dotColor)} />
          <span className="truncate text-lg font-medium text-text-primary" title={project.tab}>
            {project.tab}
          </span>
          {tabOpen && <span title="Terminal open"><Terminal className="h-3.5 w-3.5 shrink-0 text-accent-text" /></span>}
          {session?.health && <SessionBadge health={session.health} />}
          {profile?.status && !session?.health && (
            <span className="truncate text-sm text-text-tertiary" title={profile.status}>{profile.status}</span>
          )}
        </div>

        {git && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
            <div className="flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              <span className="max-w-[16rem] truncate" title={git.branch}>{git.branch}</span>
              {git.dirty && <span className="text-status-warning">✎</span>}
              {git.todayCount > 0 && <span className="text-status-positive/80">+{git.todayCount}</span>}
            </div>
            {git.behindRemote > 0 && (
              <>
                <span className="text-status-warning">↓{git.behindRemote}</span>
                <button
                  onClick={async () => {
                    setSyncing(true);
                    setSyncResult(null);
                    try {
                      const res = await postJson("/api/project/sync", { dir: project.dir });
                      const data = await res.json();
                      setSyncResult(res.ok ? "✓" : (data.error ?? "Failed"));
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  disabled={syncing}
                  className="text-status-warning transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  {syncing ? "…" : "pull"}
                </button>
                {syncResult && <span>{syncResult}</span>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {profile?.url && (
          <a
            href={profile.url.startsWith("http") ? profile.url : `https://${profile.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-text-muted transition-colors hover:text-text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button
          onClick={onProfileToggle}
          title={profileOpen ? "Close profile" : "Project profile"}
          className={cn(
            "p-1 transition-colors hover:text-text-primary",
            profileOpen ? "text-accent-text" : "text-text-muted",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse"
            className="p-1 text-text-muted transition-colors hover:text-text-primary"
          >
            <ChevronsDown className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function SessionSummary({
  session,
  isClosed,
}: {
  session: ProjectState["session"];
  isClosed: boolean;
}) {
  if (isClosed || !session) return null;
  if (!session.next && !session.done) return null;
  return (
    <div className="space-y-1 ui-card-section">
      {session.next && (
        <p className="text-sm text-text-primary leading-snug">{session.next}</p>
      )}
      {session.done && (
        <p className="text-xs text-text-tertiary leading-snug">{session.done}</p>
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

function PromptInput({
  custom,
  listening,
  supported,
  sending,
  placeholder,
  onCustomChange,
  onCustomFocusChange,
  onSendCustom,
  toggleMic,
}: {
  custom: string;
  listening: boolean;
  supported: boolean;
  sending: string | null;
  placeholder: string;
  onCustomChange: (v: string) => void;
  onCustomFocusChange: (f: boolean) => void;
  onSendCustom: () => void;
  toggleMic: () => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && custom.trim() && onSendCustom()}
          onFocus={() => onCustomFocusChange(true)}
          onBlur={() => onCustomFocusChange(false)}
          placeholder={listening ? "Listening…" : placeholder}
          className={cn("ui-input w-full", supported && "pr-10", listening && "border-status-negative/40")}
        />
        {supported && (
          <button
            type="button"
            onClick={toggleMic}
            title={listening ? "Stop recording" : "Voice input"}
            className={cn(
              "absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors",
              listening
                ? "text-status-negative animate-pulse hover:bg-status-negative/10"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-raised",
            )}
          >
            {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <button
        onClick={onSendCustom}
        disabled={!custom.trim() || sending !== null}
        className="ui-btn-lg shrink-0 py-3.5 sm:px-5"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

export function IntentButtonPanel({
  project,
  currentAdapter,
  autoContinueEnabled,
  sending,
  custom,
  bannerActive,
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
  bannerActive?: boolean;
  onToggleAutoContinue: () => void;
  onSendIntent: (intent: OrchestrationTaskIntentId) => void;
  onSendCustom: () => void;
  onCustomChange: (value: string) => void;
  onCustomFocusChange: (focused: boolean) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [clearingContext, setClearingContext] = useState(false);

  const appendTranscript = useCallback((text: string) => {
    onCustomChange((custom ? custom + " " : "") + text);
  }, [custom, onCustomChange]);
  const { listening, supported, toggle: toggleMic } = useSpeechRecognition(appendTranscript);

  const inputProps = { custom, listening, supported, sending, onCustomChange, onCustomFocusChange, onSendCustom, toggleMic };

  const recentPrompts = project.recentCustomPrompts.slice(0, project.agentRunning ? 3 : undefined);

  // Running: interrupt input + recent prompts only
  if (project.agentRunning) {
    return (
      <div className="ui-card-section space-y-2">
        <PromptInput {...inputProps} placeholder="Send interrupt…" />
        {recentPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recentPrompts.map((r) => (
              <button
                key={r.customPrompt}
                onClick={() => onCustomChange(r.customPrompt)}
                title={r.customPrompt}
                className="max-w-[18rem] truncate rounded-xl border border-border-subtle bg-surface-overlay px-3 py-1.5 text-left text-xs text-text-tertiary transition-colors hover:border-border-default hover:text-text-secondary"
              >
                {r.customPrompt.length > 50 ? r.customPrompt.slice(0, 50) + "…" : r.customPrompt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // All other states: custom input on top, then intent chips, then recent prompts
  const primaryAndAction = [...PRIMARY_INTENTS, ...ACTION_INTENTS];

  return (
    <div className="space-y-2.5 ui-card-section">
      <PromptInput {...inputProps} placeholder="Custom prompt…" />

      {/* Intent chips — hidden when banner is active (banner has the primary CTA) */}
      {!bannerActive && (
        <div className="flex flex-wrap items-center gap-1.5">
          {primaryAndAction.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onSendIntent(id)}
              disabled={sending !== null}
              className="rounded-xl border border-border-subtle bg-surface-overlay px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-default hover:text-text-primary disabled:opacity-40"
            >
              {sending === id ? "…" : label}
            </button>
          ))}
          <button
            onClick={() => setShowMore((v) => !v)}
            className="rounded-xl border border-border-subtle px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            {showMore ? "Less" : "···"}
          </button>
          <button
            onClick={onToggleAutoContinue}
            title={autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
            className="ml-auto text-text-muted transition-colors hover:text-text-secondary"
          >
            {autoContinueEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {showMore && (
        <div className="flex flex-wrap gap-1.5">
          {MORE_INTENTS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onSendIntent(id)}
              disabled={sending !== null}
              className="rounded-xl border border-border-subtle bg-surface-overlay px-3 py-1.5 text-xs text-text-tertiary transition-colors hover:border-border-default hover:text-text-secondary disabled:opacity-40"
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
              className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-overlay px-3 py-1.5 text-xs text-text-tertiary transition-colors hover:border-border-default hover:text-status-warning disabled:opacity-40"
            >
              {clearingContext ? <Loader2 className="ui-spinner-sm" /> : <Eraser className="h-3.5 w-3.5" />}
              Clear context
            </button>
          )}
        </div>
      )}

      {recentPrompts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recentPrompts.map((r) => (
            <button
              key={r.customPrompt}
              onClick={() => onCustomChange(r.customPrompt)}
              title={r.customPrompt}
              className="max-w-[18rem] truncate rounded-xl border border-border-subtle bg-surface-overlay px-3 py-1.5 text-left text-xs text-text-tertiary transition-colors hover:border-border-default hover:text-text-secondary"
            >
              {r.count > 1 && <span className="mr-1.5">×{r.count}</span>}
              {r.customPrompt.length > 60 ? r.customPrompt.slice(0, 60) + "…" : r.customPrompt}
            </button>
          ))}
        </div>
      )}

      {bannerActive && (
        <div className="flex justify-end">
          <button
            onClick={onToggleAutoContinue}
            title={autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
            className="text-text-muted transition-colors hover:text-text-secondary"
          >
            {autoContinueEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
