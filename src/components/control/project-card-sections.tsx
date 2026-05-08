"use client";

import { useState, useRef, useCallback } from "react";
import {
  GitBranch, Circle, Terminal, ExternalLink,
  Pause, Play, Eraser, Loader2, Send, Mic,
  SlidersHorizontal, ChevronsDown, ListPlus, X,
  GripVertical, Sparkles,
} from "lucide-react";
import { useWhisperMic } from "@/hooks/use-whisper-mic";
import { cn } from "@/lib/utils";
import { compactRelativeDate } from "@/lib/dates";
import { postJson } from "@/lib/api/fetch";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { PRIMARY_INTENTS, ACTION_INTENTS, MORE_INTENTS } from "@/config/control-intents";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";
import {
  SessionBadge, ClosedBanner, ClosingBanner, RunningBanner, ReadyBanner,
} from "./project-card-helpers";
import { splitSessionItems } from "@/lib/session-content";

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

  const isIdle = !project.agentRunning && !isReady && !isOrchReady && !isClosed;
  const lastActiveMs = session?.mtime ?? (project.closedAt ? project.closedAt * 1000 : null);
  const lastActiveLabel = lastActiveMs
    ? compactRelativeDate(new Date(lastActiveMs))
    : git?.lastWhen ?? null;
  const healthShort = session?.health
    ? session.health.split(/\s*[,—–]\s*/)[0].trim().toLowerCase()
    : null;

  const dotColor = project.agentRunning
    ? "text-accent-text animate-pulse"
    : isClosed || isReady || isOrchReady
    ? "text-status-positive"
    : "text-text-muted";

  return (
    <div className="px-4 py-4 sm:px-5 md:px-6">
      <div className="ui-card-header !mb-0">
        <div className="ui-card-header-main space-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Circle className={cn("h-2.5 w-2.5 shrink-0 fill-current", dotColor)} />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold text-text-primary sm:text-lg" title={project.tab}>
                  {project.tab}
                </span>
                {tabOpen && (
                  <span title="Terminal open" className="ui-tag ui-tag-neutral gap-1.5">
                    <Terminal className="h-3 w-3 shrink-0" />
                    Live tab
                  </span>
                )}
                {/* Health badge only for active/ready/closed — idle projects fold it into the context line below */}
                {!isIdle && session?.health && <SessionBadge health={session.health} />}
              </div>
              {/* Idle context line: "last 2d ago · good" — replaces the health badge for quiet projects */}
              {isIdle && (lastActiveLabel || healthShort) && (
                <p className="mt-0.5 text-xs text-text-muted">
                  {[lastActiveLabel && `last ${lastActiveLabel}`, healthShort].filter(Boolean).join(" · ")}
                </p>
              )}
              {/* Profile status when no health available (any state) */}
              {profile?.status && !session?.health && (
                <p className="mt-1 truncate text-sm text-text-tertiary" title={profile.status}>{profile.status}</p>
              )}
            </div>
          </div>

          {git && (
            <div className="ui-control-card-header-meta">
              <div className="flex min-w-0 items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />
                <span className="max-w-[16rem] truncate" title={git.branch}>{git.branch}</span>
                {git.dirty && <span className="text-status-warning" title="Uncommitted changes">✎</span>}
                {git.todayCount > 0 && (
                  <span className="text-status-positive/80" title={`${git.todayCount} commit${git.todayCount > 1 ? "s" : ""} today`}>+{git.todayCount}</span>
                )}
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
                    className="ui-chip-action-compact border-status-warning/30 text-status-warning hover:text-text-primary"
                  >
                    {syncing ? "…" : "pull"}
                  </button>
                  {syncResult && <span>{syncResult}</span>}
                </>
              )}
            </div>
          )}
        </div>

        <div className="ui-card-actions shrink-0 self-start">
          {profile?.url && (
            <a
              href={profile.url.startsWith("http") ? profile.url : `https://${profile.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-icon-action"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button
            onClick={onProfileToggle}
            title={profileOpen ? "Close profile" : "Project profile"}
            className={cn(
              "ui-icon-action",
              profileOpen ? "text-accent-text" : "text-text-muted",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse"
              className="ui-icon-action"
            >
              <ChevronsDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BulletList({ items, icon, iconClass, textClass }: {
  items: string[];
  icon: string;
  iconClass: string;
  textClass: string;
}) {
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3">
          <span className={cn("shrink-0 select-none font-bold leading-relaxed", iconClass)}>{icon}</span>
          <p className={cn("select-text text-base leading-relaxed", textClass)}>{item}</p>
        </div>
      ))}
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
  const [expanded, setExpanded] = useState(false);

  if (isClosed || !session) return null;
  if (!session.next && !session.done) return null;

  const nextItems = session.next ? splitSessionItems(session.next) : [];
  const doneItems = session.done ? splitSessionItems(session.done) : [];
  const needsExpand = nextItems.length > 1 || doneItems.length > 0;

  // Collapsed: one primary next item visible, "Show all" toggle if there's more
  if (!expanded) {
    const preview = nextItems[0] ?? doneItems[0] ?? "";
    return (
      <div className="ui-card-section">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 shrink-0 select-none font-bold text-accent-text">→</span>
            <p className="select-text text-base leading-relaxed text-text-primary">{preview}</p>
          </div>
          {needsExpand && (
            <button
              onClick={() => setExpanded(true)}
              className="shrink-0 whitespace-nowrap text-sm text-text-muted transition-colors hover:text-text-secondary"
            >
              Show all ↓
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded: full list with section labels
  return (
    <div className="ui-card-section space-y-5">
      <div className="flex items-center justify-between">
        <span className="ui-kicker text-accent-text">Agent&apos;s plan</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          ↑ Collapse
        </button>
      </div>
      {nextItems.length > 0 && (
        <BulletList items={nextItems} icon="→" iconClass="text-accent-text" textClass="text-text-primary" />
      )}
      {doneItems.length > 0 && (
        <div className="space-y-2.5">
          <p className="ui-kicker">Done</p>
          <BulletList items={doneItems} icon="✓" iconClass="text-status-positive" textClass="text-text-secondary" />
        </div>
      )}
    </div>
  );
}

export function ProjectBanners({
  tab,
  isClosed,
  isClosing,
  isReady,
  isOrchReady,
  isRunning,
  showRunning,
  session,
  git,
  closingAt,
  currentPrompt,
  prompts,
  autoContinueEnabled,
  paused,
  nextQueueItem,
  queueTotal = 0,
  onDismiss,
  onSend,
  onAutoInject,
}: {
  tab: string;
  isClosed: boolean;
  isClosing: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  isRunning: boolean;
  showRunning: boolean;
  session: ProjectState["session"];
  git: ProjectState["git"];
  closingAt: number | null;
  currentPrompt: ProjectState["currentPrompt"];
  prompts: PromptMeta[];
  autoContinueEnabled: boolean;
  paused: boolean;
  nextQueueItem?: string;
  queueTotal?: number;
  onDismiss: () => void;
  onSend: (key: string) => void;
  onAutoInject?: () => void;
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
          tab={tab}
          prompts={prompts}
          onSend={onSend}
          onDismiss={onDismiss}
          onAutoInject={onAutoInject}
          paused={paused}
          title="Agent finished"
          autoContinueEnabled={autoContinueEnabled}
          nextQueueItem={nextQueueItem}
          queueTotal={queueTotal}
        />
      )}
      {isOrchReady && (
        <ReadyBanner
          tab={tab}
          prompts={prompts}
          onSend={(key) => {
            const intent = mapClaudePromptToIntent(key);
            if (!intent) return;
            onSend(key);
          }}
          onDismiss={onDismiss}
          onAutoInject={onAutoInject}
          paused={paused}
          title="Task finished"
          autoContinueEnabled={autoContinueEnabled}
          nextQueueItem={nextQueueItem}
          queueTotal={queueTotal}
        />
      )}
      {showRunning && currentPrompt && (
        <RunningBanner label={currentPrompt.label} promptKey={currentPrompt.key} startedAt={currentPrompt.startedAt} />
      )}
      {isRunning && !currentPrompt && !isClosing && (
        <div className="border-t border-accent-primary/25 bg-accent-primary/[0.05] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Loader2 className="ui-spinner-sm text-accent-text shrink-0" />
            <span className="text-sm font-medium text-accent-text">Agent active</span>
            {git?.todayCount ? (
              <span className="ml-auto text-sm text-text-secondary tabular-nums">+{git.todayCount} commits today</span>
            ) : null}
          </div>
          {session?.next && (
            <p className="mt-1.5 text-xs text-text-tertiary leading-relaxed line-clamp-2">
              Next: {session.next}
            </p>
          )}
          {!session?.next && session?.done && (
            <p className="mt-1.5 text-xs text-text-tertiary leading-relaxed line-clamp-1">
              Last: {session.done}
            </p>
          )}
        </div>
      )}
    </>
  );
}

// Exported so the beacon popup can import this instead of duplicating it.
export function PromptInput({
  custom,
  listening,
  processing,
  micError,
  sending,
  placeholder,
  showQueue,
  waveformBars,
  recordingSeconds,
  maxRecordingSeconds,
  textareaRef,
  onCustomChange,
  onCustomFocusChange,
  onSendCustom,
  onEnqueue,
  toggleMic,
}: {
  custom: string;
  listening: boolean;
  processing: boolean;
  micError: string;
  sending: string | null;
  placeholder: string;
  showQueue?: boolean;
  waveformBars?: number[];
  recordingSeconds?: number;
  maxRecordingSeconds?: number;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onCustomChange: (v: string) => void;
  onCustomFocusChange?: (f: boolean) => void;
  onSendCustom: () => void;
  onEnqueue?: () => void;
  toggleMic: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={custom}
            onChange={(e) => onCustomChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && (custom.trim() || listening)) {
                e.preventDefault();
                if (e.altKey && onEnqueue) onEnqueue();
                else onSendCustom();
              }
            }}
            onFocus={() => onCustomFocusChange?.(true)}
            onBlur={() => onCustomFocusChange?.(false)}
            placeholder={listening ? "Recording… click ↗ to send" : processing ? "Transcribing…" : placeholder}
            className={cn(
              "ui-input w-full resize-none pr-10",
              listening && "border-status-negative/40",
              processing && "border-accent-primary/30",
            )}
            style={{ fieldSizing: "content", maxHeight: "8rem" } as React.CSSProperties}
          />
          <button
            type="button"
            onClick={toggleMic}
            disabled={processing}
            title={listening ? "Stop recording" : "Voice input (Whisper)"}
            className={cn(
              "absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors",
              listening
                ? "text-status-negative animate-pulse hover:bg-status-negative/10"
                : processing
                ? "text-text-muted opacity-50"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-raised",
            )}
          >
            {processing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : listening
              ? <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              : <Mic className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {showQueue && onEnqueue && (
            <button
              onClick={onEnqueue}
              disabled={(!custom.trim() && !listening) || sending !== null}
              title={listening ? "Stop recording and add to queue" : "Add to queue · Alt+Enter"}
              className="ui-icon-action min-h-11 rounded-xl border border-border-default px-3 disabled:opacity-40"
            >
              <ListPlus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onSendCustom}
            disabled={(!custom.trim() && !listening) || sending !== null}
            title={listening ? "Stop recording and send" : undefined}
            className="ui-btn-lg inline-flex min-h-11 items-center justify-center py-3.5 sm:px-5"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* Mic status row */}
      {(micError || listening || processing) && (
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center">
            {micError && <p className="text-[11px] text-status-negative">{micError}</p>}
            {listening && !micError && (() => {
              const flat = (recordingSeconds ?? 0) >= 2 && (waveformBars ?? []).every((b) => b < 0.02);
              const secs = recordingSeconds ?? 0;
              const max = maxRecordingSeconds ?? 60;
              const label = `${secs}s / ${max}s`;
              return flat
                ? <p className="text-[11px] text-status-warning">No audio — speak closer or raise mic volume</p>
                : <p className="text-[11px] text-status-negative">Recording · {label}</p>;
            })()}
            {processing && !micError && <p className="text-[11px] text-text-tertiary animate-pulse">Transcribing…</p>}
          </div>
          {listening && !micError && waveformBars && (
            <div className="flex items-end gap-[2px]" style={{ height: 16 }}>
              {waveformBars.map((h, i) => (
                <div key={i} className="rounded-full bg-status-negative"
                  style={{ width: 2, height: Math.max(2, Math.round(h * 14)), transition: "height 75ms ease" }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QueueList({
  queue,
  onSend,
  onRemove,
  onReorder,
  onEdit,
  onMerge,
  merging,
}: {
  queue: string[];
  onSend?: (i: number) => void;
  onRemove?: (i: number) => void;
  onReorder?: (from: number, to: number) => void;
  onEdit?: (i: number, text: string) => void;
  onMerge?: () => void;
  merging?: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditText(queue[i]);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const confirmEdit = () => {
    if (editingIndex !== null && onEdit) onEdit(editingIndex, editText);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-0 border-t border-border-subtle">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 sm:px-5">
        <p className="ui-kicker">Queue · {queue.length}</p>
        {queue.length >= 2 && onMerge && (
          <button
            onClick={onMerge}
            disabled={merging}
            title="Merge all items into one coherent prompt with AI"
            className="flex items-center gap-1 text-[10px] text-text-muted transition-colors hover:text-accent-text disabled:opacity-50"
          >
            {merging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {merging ? "Merging…" : "AI merge"}
          </button>
        )}
      </div>
      {queue.map((item, i) => (
        <div
          key={i}
          draggable={onReorder ? true : undefined}
          onDragStart={() => { dragIndex.current = i; }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex.current !== null && dragIndex.current !== i && onReorder) {
              onReorder(dragIndex.current, i);
            }
            setDragOver(null);
            dragIndex.current = null;
          }}
          onDragEnd={() => { setDragOver(null); dragIndex.current = null; }}
          className={cn(
            "flex items-start gap-2 px-4 py-2 sm:px-5",
            dragOver === i && "bg-accent-primary/5",
            "border-b border-border-subtle last:border-b-0",
          )}
        >
          {onReorder && (
            <div className="mt-[3px] shrink-0 cursor-grab text-text-muted hover:text-text-secondary active:cursor-grabbing">
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}
          <span className={cn(
            "mt-[3px] shrink-0 text-[10px] font-bold tabular-nums",
            i === 0 ? "text-accent-text" : "text-text-muted",
          )}>
            {i + 1}
          </span>

          {editingIndex === i ? (
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                if (e.key === "Escape") setEditingIndex(null);
              }}
              onBlur={confirmEdit}
              rows={2}
              className="ui-input flex-1 resize-none text-sm"
              style={{ fieldSizing: "content", maxHeight: "6rem" } as React.CSSProperties}
            />
          ) : (
            <button
              onClick={() => onEdit && startEdit(i)}
              title="Click to edit · use → to send now"
              className={cn(
                "flex-1 text-left text-sm leading-snug transition-colors",
                i === 0 ? "text-text-primary" : "text-text-tertiary",
                onEdit && "hover:text-text-primary",
              )}
            >
              {item}
            </button>
          )}

          {editingIndex !== i && (
            <div className="mt-0.5 flex shrink-0 gap-0.5">
              {onSend && (
                <button
                  onClick={() => onSend(i)}
                  className="rounded p-0.5 text-text-muted transition-colors hover:text-accent-text"
                  title="Send now"
                >
                  <Send className="h-3 w-3" />
                </button>
              )}
              {onRemove && (
                <button
                  onClick={() => onRemove(i)}
                  className="rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
                  title="Remove from queue"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function IntentButtonPanel({
  project,
  currentAdapter,
  autoContinueEnabled,
  sending,
  custom,
  queue = [],
  bannerActive,
  merging,
  onToggleAutoContinue,
  onSendIntent,
  onSendCustom,
  onEnqueueCustom,
  onSendFromQueue,
  onRemoveFromQueue,
  onReorderInQueue,
  onEditInQueue,
  onMergeQueue,
  onSendText,
  onCustomChange,
  onCustomFocusChange,
}: {
  project: ProjectState;
  currentAdapter: string;
  autoContinueEnabled: boolean;
  sending: string | null;
  custom: string;
  queue?: string[];
  bannerActive?: boolean;
  merging?: boolean;
  onToggleAutoContinue: () => void;
  onSendIntent: (intent: OrchestrationTaskIntentId) => void;
  onSendCustom: () => void;
  onEnqueueCustom?: (prompt: string) => void;
  onSendFromQueue?: (index: number) => void;
  onRemoveFromQueue?: (index: number) => void;
  onReorderInQueue?: (from: number, to: number) => void;
  onEditInQueue?: (index: number, text: string) => void;
  onMergeQueue?: () => void;
  // Direct-text send used when recording stops: bypasses stale `custom` state
  onSendText?: (text: string) => void;
  onCustomChange: (value: string) => void;
  onCustomFocusChange: (focused: boolean) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [clearingContext, setClearingContext] = useState(false);
  const pendingMicActionRef = useRef<"send" | "queue" | null>(null);

  const appendTranscript = useCallback((text: string) => {
    const newText = (custom ? `${custom} ${text}` : text).trim();
    onCustomChange(newText);
    const pending = pendingMicActionRef.current;
    if (pending) {
      pendingMicActionRef.current = null;
      if (pending === "send" && onSendText && newText) {
        onSendText(newText);
        onCustomChange("");
      } else if (pending === "queue" && onEnqueueCustom && newText) {
        onEnqueueCustom(newText);
        onCustomChange("");
      }
    }
  }, [custom, onCustomChange, onSendText, onEnqueueCustom]);

  const { listening, processing, error: micError, toggle: toggleMic, waveformBars, recordingSeconds, maxSeconds: maxRecordingSeconds } = useWhisperMic(appendTranscript);

  // When recording is active, Send/Queue stop the mic and queue the action for post-transcription.
  const handleSendCustom = useCallback(() => {
    if (listening) {
      pendingMicActionRef.current = "send";
      toggleMic();
      return;
    }
    onSendCustom();
  }, [listening, toggleMic, onSendCustom]);

  const handleEnqueue = useCallback(() => {
    if (listening) {
      pendingMicActionRef.current = "queue";
      toggleMic();
      return;
    }
    if (custom.trim() && onEnqueueCustom) {
      onEnqueueCustom(custom.trim());
      onCustomChange("");
    }
  }, [listening, toggleMic, custom, onEnqueueCustom, onCustomChange]);

  const inputProps = {
    custom, listening, processing, micError, sending, waveformBars, recordingSeconds, maxRecordingSeconds,
    onCustomChange, onCustomFocusChange, toggleMic,
    showQueue: !!onEnqueueCustom,
    onSendCustom: handleSendCustom,
    onEnqueue: handleEnqueue,
  };

  const recentPrompts = project.recentCustomPrompts.slice(0, project.agentRunning ? 3 : undefined);

  // Running: interrupt input + pause toggle + recent prompts
  if (project.agentRunning) {
    return (
      <div className="ui-card-section space-y-2">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <PromptInput {...inputProps} placeholder="Send interrupt…" />
          </div>
          <button
            onClick={onToggleAutoContinue}
            title={autoContinueEnabled ? "Pause auto-continue when done" : "Resume auto-continue"}
            className="ui-icon-action shrink-0 self-start rounded-xl border border-border-default px-3 py-[0.65rem]"
          >
            {autoContinueEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        </div>
        {queue.length > 0 && (
          <QueueList queue={queue} onSend={onSendFromQueue} onRemove={onRemoveFromQueue} onReorder={onReorderInQueue} onEdit={onEditInQueue} onMerge={onMergeQueue} merging={merging} />
        )}
        {recentPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recentPrompts.map((r) => (
              <button
                key={r.customPrompt}
                onClick={() => onCustomChange(r.customPrompt)}
                title={r.customPrompt}
                className="ui-chip-action-compact max-w-[18rem] truncate text-left text-text-tertiary hover:text-text-secondary"
              >
                {r.customPrompt.length > 50 ? r.customPrompt.slice(0, 50) + "…" : r.customPrompt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // All other states: custom input, then action area, then recent prompts
  const [primary] = PRIMARY_INTENTS; // next_best is always first

  return (
    <div className="space-y-2.5 ui-card-section">
      <PromptInput {...inputProps} placeholder="Custom prompt…" />
      {queue.length > 0 && (
        <QueueList queue={queue} onSend={onSendFromQueue} onRemove={onRemoveFromQueue} onReorder={onReorderInQueue} onEdit={onEditInQueue} onMerge={onMergeQueue} merging={merging} />
      )}

      {/* Action area — hidden when banner is active (banner owns the primary CTA) */}
      {!bannerActive && primary && (
        <div className="space-y-2">
          {/* Primary CTA: Next best — full width, visually elevated */}
          <div className="flex gap-2">
            <button
              onClick={() => onSendIntent(primary.id)}
              disabled={sending !== null}
              className="flex-1 rounded-xl border border-accent-primary/30 bg-accent-primary/[0.07] px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/[0.12] disabled:opacity-50"
            >
              {sending === primary.id ? "…" : `${primary.label} →`}
            </button>
            <button
              onClick={onToggleAutoContinue}
              title={autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
              className="ui-icon-action shrink-0 rounded-xl border border-border-default px-3"
            >
              {autoContinueEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Secondary intents: compact chips + More toggle */}
          <div className="flex flex-wrap gap-1.5">
            {ACTION_INTENTS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onSendIntent(id)}
                disabled={sending !== null}
                className="ui-chip-action-compact text-text-secondary"
              >
                {sending === id ? "…" : label}
              </button>
            ))}
            <button
              onClick={() => setShowMore((v) => !v)}
              className="ui-chip-action-compact text-text-muted"
            >
              {showMore ? "↑ Less" : "More"}
            </button>
          </div>

          {/* Expanded: rarely-used intents */}
          {showMore && (
            <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-2">
              {MORE_INTENTS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => onSendIntent(id)}
                  disabled={sending !== null}
                  className="ui-chip-action-compact text-text-tertiary"
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
                  className="ui-chip-action-compact inline-flex items-center gap-1.5 text-text-tertiary hover:text-status-warning"
                >
                  {clearingContext ? <Loader2 className="ui-spinner-sm" /> : <Eraser className="h-3.5 w-3.5" />}
                  Clear context
                </button>
              )}
            </div>
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
              className="ui-chip-action-compact max-w-[18rem] truncate text-left text-text-tertiary hover:text-text-secondary"
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
