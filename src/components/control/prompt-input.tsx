"use client";

import { AlertCircle, Loader2, Send, Mic, ListPlus, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PromptInput({
  custom,
  listening,
  processing,
  micError,
  sending,
  sendError,
  onClearSendError,
  placeholder,
  showQueue,
  waveformBars,
  recordingSeconds,
  maxRecordingSeconds,
  autoContinueEnabled,
  statusLabel,
  textareaRef,
  onCustomChange,
  onCustomFocusChange,
  onSendCustom,
  onEnqueue,
  onToggleAutoContinue,
  toggleMic,
}: {
  custom: string;
  listening: boolean;
  processing: boolean;
  micError: string;
  sending: string | null;
  /** Inline error banner shown above the input when the last send attempt
   *  failed. The draft text is preserved (custom state survives), so the user
   *  can retry from the same input. */
  sendError?: string | null;
  /** Dismiss the inline error banner. */
  onClearSendError?: () => void;
  placeholder: string;
  showQueue?: boolean;
  waveformBars?: number[];
  recordingSeconds?: number;
  maxRecordingSeconds?: number;
  autoContinueEnabled?: boolean;
  statusLabel?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onCustomChange: (v: string) => void;
  onCustomFocusChange?: (f: boolean) => void;
  onSendCustom: () => void;
  onEnqueue?: () => void;
  onToggleAutoContinue?: () => void;
  toggleMic: () => void;
}) {
  const isComposing = custom.trim().length > 0 || listening || processing;
  const status = statusLabel ?? (micError
    ? micError
    : listening
    ? "Recording - paused"
    : processing
    ? "Transcribing..."
    : custom.trim()
    ? "Enter sends - Alt+Enter queues"
    : autoContinueEnabled === false
    ? "Auto-continue paused"
    : autoContinueEnabled === true && isComposing
    ? "Auto-continue pauses while composing"
    : autoContinueEnabled === true
    ? "Auto-continue ready"
    : "");

  return (
    <div className="overflow-hidden rounded-2xl border border-border-default bg-surface-raised">
      {sendError && (
        <div className="flex items-start gap-2 border-b border-status-negative/30 bg-status-negative-subtle px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-negative" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-status-negative">Send failed</p>
            <p className="mt-0.5 truncate text-xs text-status-negative/80" title={sendError}>
              {sendError}
            </p>
            <p className="mt-1 text-micro text-text-tertiary">
              Your text is preserved below — fix the issue and tap Send again.
            </p>
          </div>
          {onClearSendError && (
            <button
              type="button"
              onClick={onClearSendError}
              aria-label="Dismiss error"
              className="ui-icon-action shrink-0 hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <div className="relative">
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
            placeholder={listening ? "Recording..." : processing ? "Transcribing..." : placeholder}
            className={cn(
              "w-full resize-none bg-transparent px-4 pb-3 pr-11 pt-3.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted outline-none",
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
              "absolute right-2.5 top-2.5 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg p-1.5 transition-colors",
              listening
                ? "text-status-negative animate-pulse hover:bg-status-negative/10"
                : processing
                ? "text-text-muted opacity-50"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-raised",
            )}
          >
            {processing
              ? <Loader2 className="ui-spinner-sm" />
              : listening
              ? <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              : <Mic className="h-3.5 w-3.5" />}
          </button>
      </div>

      {listening && waveformBars && (
        <div className="flex items-center gap-3 px-4 pb-2">
          <div className="flex items-end gap-[2px]" style={{ height: 14 }}>
            {waveformBars.map((h, i) => (
              <div
                key={i}
                className="rounded-full bg-status-negative"
                style={{ width: 2, height: Math.max(2, Math.round(h * 12)), transition: "height 75ms ease" }}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums text-status-negative">
            {(() => {
              const secs = recordingSeconds ?? 0;
              const max = maxRecordingSeconds ?? 60;
              const flat = secs >= 2 && waveformBars.every((b) => b < 0.02);
              return flat ? "No audio - speak closer" : `${secs}s / ${max}s`;
            })()}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t border-border-subtle px-3 py-2">
        {onToggleAutoContinue && typeof autoContinueEnabled === "boolean" && (
          <button
            onClick={onToggleAutoContinue}
            disabled={processing}
            title={autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
            className={cn(
              "shrink-0 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-md p-1 transition-colors",
              autoContinueEnabled
                ? "text-text-muted hover:bg-surface-overlay hover:text-text-secondary"
                : "text-accent-text hover:bg-surface-overlay",
            )}
          >
            {autoContinueEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        )}
        <span className={cn(
          "min-w-0 flex-1 truncate text-xs",
          micError ? "text-status-negative" : listening ? "text-status-negative" : processing ? "animate-pulse text-text-muted" : "text-text-muted",
        )}>
          {status}
        </span>
          {showQueue && onEnqueue && (
            <button
              onClick={onEnqueue}
              disabled={(!custom.trim() && !listening) || sending !== null}
              title={listening ? "Stop recording and add to queue" : "Add to queue - Alt+Enter"}
              className="ui-btn-icon shrink-0 disabled:pointer-events-none disabled:opacity-25"
            >
              <ListPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onSendCustom}
            disabled={(!custom.trim() && !listening) || sending !== null}
            title={listening ? "Stop recording and send" : undefined}
            className={cn(
              "inline-flex shrink-0 min-h-11 sm:min-h-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              custom.trim() || listening
                ? "bg-text-primary text-text-inverted hover:opacity-90"
                : "pointer-events-none bg-surface-overlay text-text-muted opacity-40",
            )}
          >
            Send
            <Send className="h-3 w-3" />
          </button>
      </div>
    </div>
  );
}
