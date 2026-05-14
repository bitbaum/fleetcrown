"use client";

import { useState, useCallback } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { useMicComposer } from "@/hooks/use-mic-composer";
import { postJson } from "@/lib/api/fetch";
import { PRIMARY_INTENTS, ACTION_INTENTS, MORE_INTENTS } from "@/config/control-intents";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import type { ProjectState } from "@/lib/control-types";
import { PromptInput, QueueList } from "./project-composer";
import { ProjectPromptLibrary } from "./ProjectPromptLibrary";

export function IntentButtonPanel({
  project,
  currentAdapter,
  isRunning,
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
  isRunning: boolean;
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
  const [showLibraryPrompts, setShowLibraryPrompts] = useState(false);
  const [clearingContext, setClearingContext] = useState(false);

  const { listening, processing, micError, toggleMic, waveformBars, recordingSeconds, maxRecordingSeconds, wrapSend, wrapEnqueue } = useMicComposer({
    custom,
    onAppend: onCustomChange,
    onSendAfterRecording: (text) => { if (onSendText && text) { onSendText(text); onCustomChange(""); } },
    onEnqueueAfterRecording: (text) => { if (onEnqueueCustom) { onEnqueueCustom(text); onCustomChange(""); } },
  });

  const handleSendCustom = useCallback(() => wrapSend(onSendCustom), [wrapSend, onSendCustom]);
  const handleEnqueue = useCallback(() => wrapEnqueue(() => {
    if (custom.trim() && onEnqueueCustom) { onEnqueueCustom(custom.trim()); onCustomChange(""); }
  }), [wrapEnqueue, custom, onEnqueueCustom, onCustomChange]);

  const inputProps = {
    custom, listening, processing, micError, sending, waveformBars, recordingSeconds, maxRecordingSeconds,
    onCustomChange, onCustomFocusChange, toggleMic,
    showQueue: !!onEnqueueCustom,
    onSendCustom: handleSendCustom,
    onEnqueue: handleEnqueue,
    autoContinueEnabled,
    onToggleAutoContinue,
    statusLabel: autoContinueEnabled
      ? "Auto-continue ready: Cockpit can send the next queued prompt when the agent waits."
      : "Auto-continue paused: Cockpit will wait for you before sending more work.",
  };

  const recentPrompts = project.recentCustomPrompts.slice(0, isRunning ? 3 : undefined);

  // Running: interrupt input + auto-continue toggle (below, not adjacent) + queue + recent prompts
  if (isRunning) {
    return (
      <div className="ui-card-section space-y-3">
        <PromptInput {...inputProps} placeholder="Send interrupt…" />
        {queue.length > 0 && (
          <QueueList queue={queue} onSend={onSendFromQueue} onRemove={onRemoveFromQueue} onReorder={onReorderInQueue} onEdit={onEditInQueue} onMerge={onMergeQueue} merging={merging} />
        )}
      {recentPrompts.length > 0 && (
        <div className="space-y-1.5">
          <p className="ui-kicker">Reuse recent prompts</p>
          <div className="flex flex-wrap gap-1.5">
            {recentPrompts.map((r) => (
              <button
                key={r.customPrompt}
                onClick={() => onCustomChange(r.customPrompt)}
                title={`Reuse this prompt: ${r.customPrompt}`}
                className="ui-chip-action-compact max-w-[18rem] truncate text-left text-text-tertiary hover:text-text-secondary"
              >
                {r.customPrompt.length > 50 ? r.customPrompt.slice(0, 50) + "…" : r.customPrompt}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
    );
  }

  // All other states: custom input, then action area, then recent prompts
  const [primary] = PRIMARY_INTENTS; // next_best is always first

  return (
    <div className="space-y-3 ui-card-section">
      <PromptInput {...inputProps} placeholder="Custom prompt…" />
      {queue.length > 0 && (
        <QueueList queue={queue} onSend={onSendFromQueue} onRemove={onRemoveFromQueue} onReorder={onReorderInQueue} onEdit={onEditInQueue} onMerge={onMergeQueue} merging={merging} />
      )}

      {/* Action area — hidden when banner is active (banner owns the primary CTA) */}
      {!bannerActive && primary && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          {/* Primary CTA: Next best — full width, visually elevated */}
          <button
            onClick={() => onSendIntent(primary.id)}
            disabled={sending !== null}
            className="w-full rounded-xl border border-accent-primary/30 bg-accent-primary/[0.07] px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/[0.12] disabled:opacity-50"
          >
            {sending === primary.id ? "…" : `${primary.label} →`}
          </button>

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
        <div className="space-y-1.5">
          <p className="ui-kicker">Reuse recent prompts</p>
          <div className="flex flex-wrap gap-1.5">
            {recentPrompts.map((r) => (
              <button
                key={r.customPrompt}
                onClick={() => onCustomChange(r.customPrompt)}
                title={`Reuse this prompt: ${r.customPrompt}`}
                className="ui-chip-action-compact max-w-[18rem] truncate text-left text-text-tertiary hover:text-text-secondary"
              >
                {r.count > 1 && <span className="mr-1.5">used {r.count}×</span>}
                {r.customPrompt.length > 60 ? r.customPrompt.slice(0, 60) + "…" : r.customPrompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <ProjectPromptLibrary
        projectName={project.tab}
        open={showLibraryPrompts}
        onOpenChange={setShowLibraryPrompts}
        onSelect={(text) => {
          if (bannerActive && onSendText) onSendText(text);
          else onCustomChange(text);
        }}
      />
    </div>
  );
}
