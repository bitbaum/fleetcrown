"use client";

import { AlertCircle, Loader2, Send, Mic, ListPlus, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPOSER_HINT } from "@/config/control-labels";
import { AttachButton, AttachmentStrip } from "@/components/ui/attachment-strip";
import type { AttachmentsController } from "@/hooks/use-attachments";

export function PromptInput({
  custom,
  listening,
  processing,
  micError,
  sending,
  justSent,
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
  attachments,
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
  /** Transient "✓ Sent" confirmation. When justSent.id === "custom" within
   *  the recent window, the Send button flashes the check. */
  justSent?: { id: string; at: number } | null;
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
  /** Screenshots and files staged for this dispatch. Omitted where a caller
   *  has no attachment support wired yet — the composer simply shows no clip. */
  attachments?: AttachmentsController;
  onCustomChange: (v: string) => void;
  onCustomFocusChange?: (f: boolean) => void;
  onSendCustom: () => void;
  onEnqueue?: () => void;
  onToggleAutoContinue?: () => void;
  toggleMic: () => void;
}) {
  // A screenshot on its own is a complete instruction — "look at this" is what
  // a picture means. So the composer counts as filled when EITHER words or
  // attachments are present, and Send unlocks the same way.
  const hasAttachments = (attachments?.attachments.length ?? 0) > 0;
  const canSend = Boolean(custom.trim()) || listening || hasAttachments;
  const isComposing = custom.trim().length > 0 || listening || processing || hasAttachments;
  const status = statusLabel ?? (micError
    ? micError
    : listening
    ? "Recording - paused"
    : processing
    ? "Transcribing..."
    : custom.trim()
    ? COMPOSER_HINT.enterSends
    : autoContinueEnabled === false
    ? COMPOSER_HINT.autoSendPaused
    : autoContinueEnabled === true && isComposing
    ? COMPOSER_HINT.autoSendWhileTyping
    : autoContinueEnabled === true
    ? COMPOSER_HINT.autoSendReady
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
              if (e.key === "Enter" && !e.shiftKey && canSend) {
                e.preventDefault();
                if (e.altKey && onEnqueue) onEnqueue();
                else onSendCustom();
              }
            }}
            onFocus={() => onCustomFocusChange?.(true)}
            onBlur={() => onCustomFocusChange?.(false)}
            // Paste-to-attach: on a laptop this is how a screenshot arrives,
            // and preventDefault only fires when the paste actually held one.
            onPaste={(e) => { if (attachments?.addFromPaste(e)) e.preventDefault(); }}
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
              "absolute right-2.5 top-2.5 ui-tap-icon inline-flex items-center justify-center rounded-lg p-1.5 transition-colors",
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

      {attachments && <AttachmentStrip attachments={attachments} />}

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
        {attachments && <AttachButton attachments={attachments} />}
        {onToggleAutoContinue && typeof autoContinueEnabled === "boolean" && (
          <button
            onClick={onToggleAutoContinue}
            disabled={processing}
            title={autoContinueEnabled ? "Pause automatic continuation for this project" : "Allow automatic continuation for this project"}
            className={cn(
              "shrink-0 ui-tap-icon inline-flex items-center justify-center rounded-md p-1 transition-colors",
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
              // The prompt queue persists TEXT. A staged screenshot cannot ride
              // along, and the first version of this let you click Queue with
              // one attached: with words it silently dropped the picture, with
              // only a picture it did nothing at all. Refusing out loud beats
              // both.
              disabled={!canSend || sending !== null || hasAttachments}
              title={
                hasAttachments
                  ? "Queued prompts are text only — send now to include the screenshot."
                  : listening
                    ? "Stop recording and queue (or send now if idle)"
                    : "Queue for later (sends immediately if this project is idle) — Alt+Enter"
              }
              className="ui-btn-icon shrink-0 disabled:pointer-events-none disabled:opacity-25"
            >
              <ListPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onSendCustom}
            disabled={!canSend || sending !== null}
            title={listening ? "Stop recording and send" : undefined}
            className={cn(
              "inline-flex shrink-0 ui-tap items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              justSent?.id === "custom"
                ? "bg-status-positive text-text-inverted"
                : canSend
                  ? "bg-text-primary text-text-inverted hover:opacity-90"
                  : "pointer-events-none bg-surface-overlay text-text-muted opacity-40",
            )}
          >
            {justSent?.id === "custom" ? "Sent ✓" : <>Send <Send className="h-3 w-3" /></>}
          </button>
      </div>
    </div>
  );
}
