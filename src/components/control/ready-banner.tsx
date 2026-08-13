"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_BEACON_COUNTDOWN_S, PROMPT_STYLE } from "@/lib/constants/control";
import { readyAtKey, beaconComposingKey } from "@/lib/control-storage";
import type { PromptMeta } from "@/lib/agent-config";

// Minimal shape ReadyBanner actually needs — both PromptMeta and AgentPrompt satisfy this.
export type PromptItem = Pick<PromptMeta, "key" | "slot" | "icon" | "label" | "style">;

export function ReadyBanner({
  tab,
  prompts,
  onSend,
  onDismiss,
  onAutoInject,
  onToggleAutoContinue,
  paused = false,
  title = "Agent finished",
  autoContinueEnabled = true,
  nextQueueItem,
  queueTotal = 0,
  healthBypass,
  dispatchReason,
  showKeyHints = false,
  inactiveLabel,
  countdownSeconds = DEFAULT_BEACON_COUNTDOWN_S,
}: {
  tab?: string;
  prompts: PromptItem[];
  onSend: (key: string) => void;
  onDismiss: () => void;
  onAutoInject?: () => void;
  onToggleAutoContinue?: () => void;
  paused?: boolean;
  title?: string;
  autoContinueEnabled?: boolean;
  nextQueueItem?: string;
  queueTotal?: number;
  healthBypass?: string;
  dispatchReason?: string;
  showKeyHints?: boolean;
  inactiveLabel?: string;
  countdownSeconds?: number;
}) {
  const [seconds, setSeconds] = useState(() => {
    if (tab) {
      try {
        const stored = localStorage.getItem(readyAtKey(tab));
        if (stored) {
          const elapsed = Math.floor((Date.now() - parseInt(stored, 10)) / 1000);
          return Math.max(0, countdownSeconds - elapsed);
        }
      } catch {}
    }
    return countdownSeconds;
  });
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";
  const onAutoInjectRef = useRef(onAutoInject);
  const onSendRef = useRef(onSend);
  useEffect(() => { onAutoInjectRef.current = onAutoInject; }, [onAutoInject]);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  useEffect(() => {
    let next = countdownSeconds;
    if (tab) {
      try {
        const stored = localStorage.getItem(readyAtKey(tab));
        if (stored) {
          const elapsed = Math.floor((Date.now() - parseInt(stored, 10)) / 1000);
          next = Math.max(0, countdownSeconds - elapsed);
        }
      } catch {}
    }
    setSeconds(next); // eslint-disable-line react-hooks/set-state-in-effect
  }, [countdownSeconds, tab]);

  const prevQueueItemRef = useRef(nextQueueItem);
  useEffect(() => {
    const wasEmpty = !prevQueueItemRef.current;
    prevQueueItemRef.current = nextQueueItem;
    if (wasEmpty && nextQueueItem) setSeconds(countdownSeconds); // eslint-disable-line react-hooks/set-state-in-effect
  }, [nextQueueItem, countdownSeconds]);

  useEffect(() => {
    // In cloud mode onAutoInject is undefined — the local stop hook handles auto-continue.
    if (paused || !autoContinueEnabled || !onAutoInjectRef.current) return;
    if (seconds <= 0) {
      try {
        if (tab && localStorage.getItem(beaconComposingKey(tab))) return;
      } catch {}
      onAutoInjectRef.current();
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, paused, autoContinueEnabled, primaryKey, tab]);

  const timerLabel = inactiveLabel ?? (!autoContinueEnabled ? "Manual" : paused ? "Paused" : `${seconds}s`);

  const nextLabel = healthBypass
    ? `AI picks recovery task — ${healthBypass.toLowerCase()}, queue paused`
    : nextQueueItem
    ? `"${nextQueueItem.length > 52 ? nextQueueItem.slice(0, 50) + "…" : nextQueueItem}"${queueTotal > 1 ? ` · +${queueTotal - 1} more` : ""}`
    : "Select the next instruction";

  return (
    <div className="border-t border-status-positive/30 bg-status-positive/[0.06] px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-status-positive" />
          <span className="text-sm font-medium text-status-positive">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-muted tabular-nums">{timerLabel}</span>
          {onToggleAutoContinue && (
            <button
              onClick={onToggleAutoContinue}
              title={autoContinueEnabled && !paused ? "Pause automatic continuation for this project" : "Allow automatic continuation for this project"}
              className={cn(
                "ui-icon-btn rounded p-0.5 transition-colors",
                paused || !autoContinueEnabled
                  ? "text-accent-text hover:bg-surface-overlay"
                  : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay",
              )}
            >
              {autoContinueEnabled && !paused
                ? <Pause className="h-3.5 w-3.5" />
                : <Play className="h-3.5 w-3.5" />}
            </button>
          )}
          <button onClick={onDismiss} className="inline-flex ui-tap items-center px-1 text-sm text-text-secondary transition-colors hover:text-text-primary">
            dismiss
          </button>
        </div>
      </div>

      <p className="mb-2 truncate font-mono text-xs text-text-muted">
        <span className="mr-1 text-text-muted">→</span>
        {nextLabel}
      </p>
      {dispatchReason && (
        <p className="mb-2 truncate font-mono text-micro text-text-muted/60">
          <span className="mr-1">AI:</span>{dispatchReason}
        </p>
      )}

      <div className="ui-control-intent-grid">
        {prompts.filter((p) => p.style === "primary" || p.style === "action").map((p, i) => (
          <button
            key={p.key}
            onClick={() => onSend(p.key)}
            className={cn(PROMPT_STYLE[p.style] ?? PROMPT_STYLE.action)}
          >
            {p.icon} {p.label}
            {showKeyHints && (
              <span className="font-mono text-micro opacity-50 tabular-nums">[{p.slot ?? i + 1}]</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
