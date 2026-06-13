"use client";

import { useState, useCallback } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { useMicComposer } from "@/hooks/use-mic-composer";
import { postJson } from "@/lib/api/fetch";
import { PRIMARY_INTENTS, ACTION_INTENTS, MORE_INTENTS } from "@/config/control-intents";
import { APP_NAME } from "@/config/brand";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import type { ProjectState } from "@/lib/control-types";
import { PromptInput } from "./prompt-input";
import { QueueList } from "./queue-list";
import { ProjectPromptLibrary } from "./ProjectPromptLibrary";
import { haptic } from "@/lib/haptics";

/** "Reuse recent prompts" chip row — rendered in both the running and idle
 *  branches of IntentButtonPanel; extracted so the two stay identical.
 *  Only shows with 2+ useful items to avoid a third competing list
 *  (Sent / Reuse recent / Prompt library) crowding the card. */
function RecentPromptChips({
  prompts,
  onPick,
}: {
  prompts: { customPrompt: string; count: number }[];
  onPick: (text: string) => void;
}) {
  if (prompts.length < 2) return null;
  return (
    <div className="space-y-1.5">
      <p className="ui-kicker">Reuse recent prompts</p>
      <div className="flex flex-wrap gap-1.5">
        {prompts.map((r) => {
          const text = r.customPrompt.replace(/\s+/g, " ").trim();
          return (
            <button
              key={r.customPrompt}
              onClick={() => onPick(r.customPrompt)}
              title={`Reuse this prompt: ${r.customPrompt}`}
              className="ui-chip-truncate-label"
            >
              {r.count > 1 && <span className="mr-1.5">used {r.count}×</span>}
              {text.length > 60 ? text.slice(0, 60) + "…" : text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function IntentButtonPanel({
  project,
  currentAdapter,
  isRunning,
  autoContinueEnabled,
  sending,
  justSent,
  sendError,
  onClearSendError,
  custom,
  queue = [],
  queueBlockedReason,
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
  onMergeItemsInQueue,
  onSendText,
  onCustomChange,
  onCustomFocusChange,
  runtimeAvailable = true,
  runtimeStateKnown = true,
  daemonSyncStale = false,
  automationStatusLabel,
}: {
  project: ProjectState;
  currentAdapter: string;
  isRunning: boolean;
  autoContinueEnabled: boolean;
  sending: string | null;
  /** Transient "✓ Dispatched" confirmation. Set on confirmed-successful
   *  send; consumers render the ✓ glyph on the matching button until the
   *  hook auto-clears it. UX audit gap: post-200 silence on every dispatch
   *  read as "did it actually do anything?" — this closes the loop. */
  justSent?: { id: string; at: number } | null;
  /** Inline error from the last sendCustom/sendText/sendIntent attempt — surfaced near the send button. */
  sendError?: string | null;
  /** Dismiss the inline error (called from the dismiss button on PromptInput). */
  onClearSendError?: () => void;
  custom: string;
  queue?: string[];
  queueBlockedReason?: string | null;
  bannerActive?: boolean;
  merging?: boolean;
  onToggleAutoContinue?: () => void;
  onSendIntent: (intent: OrchestrationTaskIntentId) => void;
  onSendCustom: () => void;
  onEnqueueCustom?: (prompt: string) => void;
  onSendFromQueue?: (index: number) => void;
  onRemoveFromQueue?: (index: number) => void;
  onReorderInQueue?: (from: number, to: number) => void;
  onEditInQueue?: (index: number, text: string) => void;
  onMergeQueue?: () => void;
  onMergeItemsInQueue?: (indices: number[]) => void;
  // Direct-text send used when recording stops: bypasses stale `custom` state
  onSendText?: (text: string) => void;
  onCustomChange: (value: string) => void;
  onCustomFocusChange: (focused: boolean) => void;
  /** False on the cloud app — gates buttons whose endpoints require a
   *  local zellij/CLI runtime and would 503 silently otherwise. */
  runtimeAvailable?: boolean;
  /** False when cached daemon-driven runtime fields cannot be trusted. */
  runtimeStateKnown?: boolean;
  daemonSyncStale?: boolean;
  automationStatusLabel?: string;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showLibraryPrompts, setShowLibraryPrompts] = useState(false);
  const [clearingContext, setClearingContext] = useState(false);

  const { listening, processing, micError, toggleMic, waveformBars, recordingSeconds, maxRecordingSeconds, wrapSend, wrapEnqueue } = useMicComposer({
    custom,
    onAppend: onCustomChange,
    onSendAfterRecording: (text) => { if (onSendText && text) { onSendText(text); onCustomChange(""); } },
    onEnqueueAfterRecording: (text) => { if (onEnqueueCustom) { onEnqueueCustom(text); onCustomChange(""); } },
  });

  const handleSendCustom = useCallback(() => wrapSend(() => { haptic(); onSendCustom(); }), [wrapSend, onSendCustom]);
  const handleEnqueue = useCallback(() => wrapEnqueue(() => {
    if (custom.trim() && onEnqueueCustom) { haptic(); onEnqueueCustom(custom.trim()); onCustomChange(""); }
  }), [wrapEnqueue, custom, onEnqueueCustom, onCustomChange]);
  const handleSendIntent = useCallback((id: OrchestrationTaskIntentId) => { haptic(); onSendIntent(id); }, [onSendIntent]);

  const inputProps = {
    custom, listening, processing, micError, sending, justSent, waveformBars, recordingSeconds, maxRecordingSeconds,
    sendError, onClearSendError,
    onCustomChange, onCustomFocusChange, toggleMic,
    showQueue: !!onEnqueueCustom,
    onSendCustom: handleSendCustom,
    onEnqueue: handleEnqueue,
    autoContinueEnabled,
    onToggleAutoContinue,
    statusLabel: !runtimeStateKnown
      ? "Fleet Runner offline: sends will queue until it reconnects."
      : daemonSyncStale
      ? "Fleet Runner sync is stale: sends will queue until it reconnects."
      : automationStatusLabel
      ? automationStatusLabel
      : autoContinueEnabled
      ? `Automatic continuation allowed for this project: ${APP_NAME} may send queued work when the agent waits.`
      : `Manual for this project: ${APP_NAME} will wait for you before sending more work.`,
  };

  const recentPrompts = project.recentCustomPrompts
    .filter((r) => {
      const t = r.customPrompt.toLowerCase();
      // Hide meta LOOP / autopilot template prompts from the "Reuse recent" chips.
      // These pollute history (the "Setup (run, read outputs)..." ones the user sees).
      if (t.startsWith("setup (run, read outputs)")) return false;
      if (t.includes("picked ") && t.includes(" (t")) return false; // the accountability line
      if (/\bwaiting for instructions\b/.test(t)) return false;
      return true;
    })
    .slice(0, isRunning ? 3 : 5);

  // Running: interrupt input + auto-continue toggle (below, not adjacent) + queue + recent prompts
  if (isRunning) {
    return (
      <div className="ui-card-section space-y-3">
        <PromptInput {...inputProps} placeholder="Send interrupt…" />
        {queue.length > 0 && (
          <QueueList queue={queue} blockedReason={queueBlockedReason} onSend={onSendFromQueue} onRemove={onRemoveFromQueue} onReorder={onReorderInQueue} onEdit={onEditInQueue} onMerge={onMergeQueue} merging={merging} onMergeItems={onMergeItemsInQueue} />
        )}
        <RecentPromptChips prompts={recentPrompts} onPick={onCustomChange} />
      </div>
    );
  }

  // All other states: custom input, then action area, then recent prompts
  const [primary] = PRIMARY_INTENTS; // next_best is always first

  return (
    <div className="space-y-3 ui-card-section">
      <PromptInput {...inputProps} placeholder="What should the agent work on? e.g. summarize this repo" />
      {queue.length > 0 && (
        <QueueList queue={queue} blockedReason={queueBlockedReason} onSend={onSendFromQueue} onRemove={onRemoveFromQueue} onReorder={onReorderInQueue} onEdit={onEditInQueue} onMerge={onMergeQueue} merging={merging} onMergeItems={onMergeItemsInQueue} />
      )}

      {/* Action area — hidden when banner is active (banner owns the primary CTA) */}
      {!bannerActive && primary && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          {/* Primary CTA: Next best — full width, visually elevated.
              Tooltip makes the AI-dispatch nature explicit per the unified
              prompt UX (2026-05-31) — every other prompt-click on /control
              fills the textarea, but this one and the secondary intent chips
              dispatch immediately. Users need to know the difference. */}
          <button
            onClick={() => handleSendIntent(primary.id)}
            disabled={sending !== null}
            title={queueBlockedReason
              ? `${queueBlockedReason}: Next best stays on recovery work and will not consume the queue. Use a queue row's send button to run that item now.`
              : "The agent re-reads ground truth (git, types, lint, TODOs, roadmap, session handoff), picks the single highest-impact task, and executes. Dispatches immediately, no preview."}
            className="w-full rounded-xl border border-accent-primary/30 bg-accent-primary/[0.07] px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/[0.12] disabled:opacity-50"
          >
            {sending === primary.id
              ? "…"
              : justSent?.id === primary.id
                ? `✓ Dispatched`
                : `${primary.label} →`}
          </button>

          {/* Secondary intents: compact chips + More toggle */}
          <div className="flex flex-wrap gap-1.5">
            {ACTION_INTENTS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleSendIntent(id)}
                disabled={sending !== null}
                className="ui-chip-action-compact text-text-secondary"
              >
                {sending === id ? "…" : justSent?.id === id ? "✓" : label}
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
                  onClick={() => handleSendIntent(id)}
                  disabled={sending !== null}
                  className="ui-chip-action-compact text-text-tertiary"
                >
                  {sending === id ? "…" : justSent?.id === id ? "✓" : label}
                </button>
              ))}
              {/* Hide on cloud — /api/project/clear-context calls
                  injectIntoTab() which requires the local zellij binary
                  and 503s otherwise; the click handler ignored failure
                  so cloud users saw a brief spinner with no feedback. */}
              {(currentAdapter === "claude" || currentAdapter === "grok") && runtimeAvailable && (
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
                  title="Send /clear to reset the agent's context window (claude/grok)"
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

      <RecentPromptChips prompts={recentPrompts} onPick={onCustomChange} />

      <ProjectPromptLibrary
        projectName={project.tab}
        open={showLibraryPrompts}
        onOpenChange={setShowLibraryPrompts}
        // Universal fill-first rule (2026-05-31): library picks always go into
        // the composer textarea so the user previews/edits before sending.
        // Previously this branched on bannerActive and silently sent — the
        // same click had different consequences depending on which surface
        // you were on, which was the UX bug the user named.
        onSelect={onCustomChange}
      />
    </div>
  );
}
