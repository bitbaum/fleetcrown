"use client";

import { useState, useRef } from "react";
import {
  Loader2, Send, Mic, ListPlus, X,
  GripVertical, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
      {/* Textarea row — items-end pins buttons to the bottom so they don't stretch as the textarea grows */}
      <div className="flex items-end gap-2">
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
              ? <Loader2 className="ui-spinner-sm" />
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-default text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40"
            >
              <ListPlus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onSendCustom}
            disabled={(!custom.trim() && !listening) || sending !== null}
            title={listening ? "Stop recording and send" : undefined}
            className="ui-btn-lg inline-flex h-10 items-center justify-center px-4"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* Mic status row */}
      {(micError || listening || processing) && (
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center">
            {micError && <p className="ui-error-xs">{micError}</p>}
            {listening && !micError && (() => {
              const flat = (recordingSeconds ?? 0) >= 2 && (waveformBars ?? []).every((b) => b < 0.02);
              const secs = recordingSeconds ?? 0;
              const max = maxRecordingSeconds ?? 60;
              const label = `${secs}s / ${max}s`;
              return flat
                ? <p className="text-xs text-status-warning">No audio — speak closer or raise mic volume</p>
                : <p className="text-xs text-status-negative">Recording · {label}</p>;
            })()}
            {processing && !micError && <p className="text-xs text-text-tertiary animate-pulse">Transcribing…</p>}
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
            className="flex items-center gap-1 text-micro text-text-muted transition-colors hover:text-accent-text disabled:opacity-50"
          >
            {merging ? <Loader2 className="ui-spinner-xs" /> : <Sparkles className="h-3 w-3" />}
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
            "mt-[3px] shrink-0 text-micro font-bold tabular-nums",
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
