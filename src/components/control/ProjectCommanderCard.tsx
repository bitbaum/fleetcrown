"use client";

import { useState } from "react";
import { Loader2, Play, MessageSquare, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectState } from "@/lib/control-types";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getProjectDisplayState } from "./control-presenter";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { postJson } from "@/lib/api/fetch";

export function ProjectCommanderCard({
  project,
  zellijTabs,
  onInject,
  onRunWithBrain,
  onLaunch,
}: {
  project: ProjectState;
  zellijTabs: string[];
  onInject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
  onRunWithBrain: (project: ProjectState, intent: OrchestrationTaskIntentId) => Promise<void>;
  onLaunch?: () => void;
}) {
  const nowS = Math.floor(Date.now() / 1000);
  const display = getProjectDisplayState(project, zellijTabs, nowS);
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue } = useAutoContinue(project.tab);

  const [sending, setSending] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const isReady = display.isReady || display.isOrchestrationReady;
  const isRunning = display.isRunning;
  const canLaunch = !!project.dir && !project.agentRunning;

  const contextLine = isRunning && project.currentPrompt
    ? project.currentPrompt.label
    : project.session?.next
    ? project.session.next
    : project.session?.done ?? null;

  const stateLabel = display.isClosed
    ? "Closed"
    : isReady
    ? "Waiting"
    : isRunning
    ? "Working"
    : project.agentRunning
    ? "Ready"
    : "Idle";

  const dotClass = isRunning
    ? "text-accent-text animate-pulse"
    : isReady || display.isClosed
    ? "text-status-positive"
    : project.agentRunning
    ? "text-text-secondary"
    : "text-border-default";

  const advance = async () => {
    setSending(true);
    try {
      await onRunWithBrain(project, "next_best");
    } finally {
      setSending(false);
    }
  };

  const sendTalk = async () => {
    const text = custom.trim();
    if (!text) return;
    setSending(true);
    try {
      await onInject(project.tab, undefined, text);
      setCustom("");
      setTalkOpen(false);
    } finally {
      setSending(false);
    }
  };

  const handleToggleAutoContinue = () => {
    const nowEnabled = !autoContinueEnabled;
    toggleAutoContinue();
    postJson("/api/control/auto-continue", { tab: project.tab, enabled: nowEnabled }).catch(() => {});
    if (!nowEnabled) {
      postJson("/api/beacon/cancel", { tab: project.tab }).catch(() => {});
    }
  };

  return (
    <div className={cn(
      "ui-card-shell overflow-hidden",
      isReady ? "border-status-positive/35" : "border-border-subtle",
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Status dot */}
        <span className={cn("h-2 w-2 shrink-0 rounded-full bg-current", dotClass)} />

        {/* Name + state + context */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">{project.tab}</span>
            <span className={cn(
              "ui-tag shrink-0",
              isRunning ? "ui-tag-warning" : isReady || display.isClosed ? "ui-tag-positive" : "ui-tag-neutral",
            )}>{stateLabel}</span>
          </div>
          {contextLine && (
            <p className="mt-0.5 line-clamp-1 text-xs text-text-tertiary">{contextLine}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {isRunning && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-text/70" />
          )}
          {isReady && (
            <>
              <button
                onClick={advance}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent-primary/30 bg-accent-primary/[0.08] px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/[0.14] disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                Continue
              </button>
              <button
                onClick={() => setTalkOpen((v) => !v)}
                title="Talk to agent"
                className={cn("ui-icon-action", talkOpen && "text-accent-text")}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {isRunning && (
            <button
              onClick={() => setTalkOpen((v) => !v)}
              title="Send interrupt"
              className={cn("ui-icon-action", talkOpen && "text-accent-text")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          )}
          {canLaunch && !isRunning && !isReady && !display.isClosed && (
            <button
              onClick={onLaunch}
              className="ui-chip-action-compact inline-flex items-center gap-1"
            >
              <Play className="h-3 w-3" />
              Start
            </button>
          )}
        </div>
      </div>

      {/* Talk panel (collapsible) */}
      {talkOpen && (
        <div className="space-y-2 border-t border-border-subtle px-4 py-3">
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={isRunning ? "Send interrupt…" : "Talk to the agent…"}
            rows={3}
            autoFocus
            className="ui-input w-full resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendTalk();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">⌘↵ to send</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setTalkOpen(false); setCustom(""); }}
                className="ui-btn-ghost px-2.5 py-1 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={sendTalk}
                disabled={!custom.trim() || sending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent-primary/30 bg-accent-primary/[0.08] px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-accent-primary/50 hover:bg-accent-primary/[0.14] disabled:opacity-50"
              >
                {sending ? "…" : "Send →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-roll footer — only when ready */}
      {isReady && (
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2">
          <button
            onClick={handleToggleAutoContinue}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium transition-colors",
              autoContinueEnabled ? "text-status-positive" : "text-text-muted hover:text-text-secondary",
            )}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full bg-current",
              autoContinueEnabled && "animate-pulse",
            )} />
            {autoContinueEnabled ? "Auto-rolling" : "Let it roll"}
          </button>
          {project.session?.health && (
            <span className="text-xs text-text-muted">{project.session.health}</span>
          )}
        </div>
      )}
    </div>
  );
}
