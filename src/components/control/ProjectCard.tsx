"use client";

import { useState, useEffect } from "react";
import {
  GitBranch, Circle, Send, ChevronDown, ChevronUp,
  Terminal, Pause, Play, Eraser, ExternalLink, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  READY_WINDOW_S, CLOSED_WINDOW_S, CLOSING_WINDOW_S,
} from "@/lib/constants/control";
import type { ProjectState, PromptMeta } from "@/app/api/control/route";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { PRIMARY_INTENTS, ACTION_INTENTS, MORE_INTENTS } from "@/config/control-intents";
import { ProjectProfile } from "./ProjectProfile";
import {
  SessionBadge, ClosedBanner, ClosingBanner,
  RunningBanner, ReadyBanner, LatestOrchestrationPanel, ProfilePanel,
} from "./project-card-helpers";


export function ProjectCard({
  project,
  prompts,
  zellijTabs,
  currentAdapter,
  onInject,
  onRunWithBrain,
  onRunCustomPrompt,
}: {
  project: ProjectState;
  prompts: PromptMeta[];
  zellijTabs: string[];
  currentAdapter: string;
  onInject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
  onRunWithBrain: (project: ProjectState, intent: OrchestrationTaskIntentId) => Promise<void>;
  onRunCustomPrompt: (project: ProjectState, prompt: string, agent: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"status" | "profile">("status");
  const [localAgent, setLocalAgent] = useState<"claude" | "codex" | "openclaw" | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [custom, setCustom] = useState("");
  const [customFocused, setCustomFocused] = useState(false);
  const [typingActive, setTypingActive] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [autoContinueEnabled, setAutoContinueEnabled] = useState(true);
  const autoContinueKey = `control:auto-continue:${project.tab.toLowerCase()}`;
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [clearingContext, setClearingContext] = useState(false);


  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(autoContinueKey);
      if (stored === "off") setAutoContinueEnabled(false);
      if (stored === "on") setAutoContinueEnabled(true);
    } catch {
      // ignore storage failures
    }
  }, [autoContinueKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(autoContinueKey, autoContinueEnabled ? "on" : "off");
    } catch {
      // ignore storage failures
    }
  }, [autoContinueEnabled, autoContinueKey]);

  useEffect(() => {
    let clearAt = 0 as unknown as ReturnType<typeof setTimeout>;
    const markTyping = () => {
      setTypingActive(true);
      if (clearAt) clearTimeout(clearAt);
      clearAt = setTimeout(() => setTypingActive(false), 8000);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      markTyping();
    };

    window.addEventListener("keydown", onKeyDown, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (clearAt) clearTimeout(clearAt);
    };
  }, []);

  const nowS = Math.floor(Date.now() / 1000);
  // readyAt/closedAt/closingAt are written by lifecycle hooks (stop.sh etc.)
  // regardless of which agent is currently configured — don't gate on agent capability.
  const isClosed =
    !dismissed &&
    !project.agentRunning &&
    project.closedAt !== null &&
    nowS - project.closedAt < CLOSED_WINDOW_S;
  const isClosing =
    !dismissed &&
    !isClosed &&
    project.closingAt !== null &&
    nowS - project.closingAt < CLOSING_WINDOW_S;
  const isReady =
    !dismissed &&
    !isClosed &&
    !isClosing &&
    !project.agentRunning &&
    project.readyAt !== null &&
    nowS - project.readyAt < READY_WINDOW_S;

  const latestOrchRun = project.latestOrchestrationRun;
  const latestOrchFinishedAtS = latestOrchRun?.finishedAt
    ? Math.floor(new Date(latestOrchRun.finishedAt).getTime() / 1000)
    : null;
  const isOrchReady =
    !dismissed &&
    !isReady &&
    !isClosed &&
    !isClosing &&
    !project.agentRunning &&
    latestOrchRun?.state === "done" &&
    latestOrchFinishedAtS !== null &&
    nowS - latestOrchFinishedAtS < READY_WINDOW_S;

  const showRunning =
    !isClosing &&
    project.currentPrompt !== null &&
    project.agentRunning;

  // Custom prompt inject
  const sendCustom = async () => {
    if (!custom.trim()) return;
    setSending("custom");
    setDismissed(true);
    try {
      await onInject(project.tab, undefined, custom.trim());
      setCustom("");
    } finally {
      setSending(null);
    }
  };

  // Intent dispatch via brain
  const sendIntent = async (intent: OrchestrationTaskIntentId) => {
    setSending(intent);
    setDismissed(true);
    try {
      await onRunWithBrain(project, intent);
    } finally {
      setSending(null);
    }
  };

  // Legacy send for ReadyBanner / ClosedBanner prompt keys — maps to intent where possible
  const send = async (promptKey?: string, customPrompt?: string) => {
    setSending(promptKey ?? "custom");
    setDismissed(true);
    try {
      if (customPrompt) {
        await onInject(project.tab, undefined, customPrompt);
      } else if (promptKey) {
        const intent = mapClaudePromptToIntent(promptKey);
        if (intent) {
          await onRunWithBrain(project, intent);
        } else {
          await onInject(project.tab, promptKey);
        }
      }
      if (!promptKey) setCustom("");
    } finally {
      setSending(null);
    }
  };

  const primaryPrompts = prompts.filter((p) => p.style === "primary");

  const tabOpen = zellijTabs.some(
    (t) => t.toLowerCase() === project.tab.toLowerCase()
  );

  const { git, session, profile } = project;

  return (
    <div
      className={cn(
        "ui-panel-raised overflow-hidden",
        isClosed
          ? "border-status-positive/30 bg-status-positive/[0.02]"
          : isClosing
          ? "border-status-warning/25 bg-status-warning/[0.02]"
          : isReady || isOrchReady
          ? "border-status-positive/40 bg-status-positive/[0.03]"
          : project.agentRunning
          ? "border-accent-primary/25 bg-accent-primary/[0.02]"
          : "border-border-subtle bg-surface-base"
      )}
    >
      {/* Tab bar */}
      <div className="flex border-b border-border-subtle">
        <button
          onClick={() => setActiveTab("status")}
          className={cn(
            "px-5 py-2.5 text-sm font-medium transition-colors",
            activeTab === "status" ? "border-b-2 border-accent-primary text-text-primary" : "text-text-secondary hover:text-text-primary"
          )}
        >
          Status
        </button>
        <button
          onClick={() => setActiveTab("profile")}
          className={cn(
            "px-5 py-2.5 text-sm font-medium transition-colors",
            activeTab === "profile" ? "border-b-2 border-accent-primary text-text-primary" : "text-text-secondary hover:text-text-primary"
          )}
        >
          Profile
        </button>
      </div>

      {activeTab === "profile" && (
        <ProjectProfile
          project={project}
          globalAdapter={currentAdapter}
          localAgent={localAgent}
          onSetAgent={setLocalAgent}
          onRunPrompt={(prompt, agent) => onRunCustomPrompt(project, prompt, agent)}
        />
      )}

      {activeTab === "status" && (
      <>
      {/* Header */}
      <div className="flex flex-col gap-3 p-5 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Circle
            className={cn(
              "h-3 w-3 shrink-0 fill-current",
              project.agentRunning
                ? "text-accent-text animate-pulse"
                : isClosed
                ? "text-status-positive"
                : isReady || isOrchReady
                ? "text-status-positive"
                : "text-text-muted"
            )}
          />
          <div className="flex min-w-0 items-center gap-2">
            <span className="break-words text-lg sm:text-xl md:text-2xl font-medium text-text-primary">{project.tab}</span>
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
                  <span className="rounded-full bg-status-warning/15 px-2 py-0.5 text-xs text-status-warning">
                    ↓ {git.behindRemote} behind
                  </span>
                  <button
                    onClick={async () => {
                      setSyncing(true);
                      setSyncResult(null);
                      try {
                        const res = await fetch("/api/project/sync", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ dir: project.dir }),
                        });
                        const data = await res.json();
                        setSyncResult(res.ok ? "Synced ✓" : data.error ?? "Failed");
                      } finally {
                        setSyncing(false);
                      }
                    }}
                    disabled={syncing}
                    className="text-xs text-status-warning transition-colors hover:text-text-primary disabled:opacity-50"
                  >
                    {syncing ? "Pulling…" : "git pull"}
                  </button>
                  {syncResult && (
                    <span className="text-xs text-text-muted">{syncResult}</span>
                  )}
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

      {/* Session summary + recent commits (skip when closed banner shows it) */}
      {!isClosed && (session || git) && (
        <div className="space-y-3 border-t border-border-subtle px-5 pb-5 pt-4">
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
      )}

      {/* Banners — only one shows at a time */}
      {isClosed && (
        <ClosedBanner
          session={session}
          git={git}
          onContinue={() => send(primaryPrompts[0]?.key ?? "next_best")}
          onDismiss={() => setDismissed(true)}
        />
      )}
      {isClosing && <ClosingBanner startedAt={project.closingAt!} />}
      {isReady && (
        <ReadyBanner
          prompts={prompts}
          onSend={(key) => send(key)}
          onDismiss={() => setDismissed(true)}
          paused={!autoContinueEnabled || typingActive || customFocused || custom.trim().length > 0}
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
            void sendIntent(intent);
          }}
          onDismiss={() => setDismissed(true)}
          paused={!autoContinueEnabled || typingActive || customFocused || custom.trim().length > 0}
          title="Task finished"
          autoContinueEnabled={autoContinueEnabled}
        />
      )}
      {showRunning && (
        <RunningBanner
          label={project.currentPrompt!.label}
          startedAt={project.currentPrompt!.startedAt}
        />
      )}
      {project.latestOrchestrationRun && <LatestOrchestrationPanel run={project.latestOrchestrationRun} />}

      {/* Profile — collapsible */}
      {profile && <ProfilePanel profile={profile} />}

      {/* Intent buttons — brain-agnostic */}
      <div className="space-y-3 border-t border-border-subtle px-5 pb-5 pt-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAutoContinueEnabled((v) => !v)}
            className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
            title={autoContinueEnabled ? "Pause automatic continue for this tab" : "Resume automatic continue for this tab"}
          >
            {autoContinueEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
          </button>

          {/* Primary: Next best — prominent, shows current brain */}
          {PRIMARY_INTENTS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => sendIntent(id)}
              disabled={sending !== null}
              className="flex flex-col items-start rounded-2xl bg-accent-primary px-4 py-3 text-sm font-medium text-text-inverted transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <span>{label}</span>
              <span className="text-xs opacity-60">via {currentAdapter}</span>
            </button>
          ))}

          {/* Action intents */}
          {ACTION_INTENTS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => sendIntent(id)}
              disabled={sending !== null}
              className="rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
            >
              {sending === id ? "…" : label}
            </button>
          ))}

          {/* More toggle */}
          <button
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface-base px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
          >
            {showMore ? "Less" : "More"} {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {showMore && (
          <div className="flex flex-wrap gap-2">
            {MORE_INTENTS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => sendIntent(id)}
                disabled={sending !== null}
                className="rounded-2xl border border-border-subtle bg-surface-overlay px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
              >
                {sending === id ? "…" : label}
              </button>
            ))}
            {currentAdapter === "claude" && (
              <button
                onClick={async () => {
                  setClearingContext(true);
                  try {
                    await fetch("/api/project/clear-context", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tab: project.tab }),
                    });
                  } finally {
                    setClearingContext(false);
                  }
                }}
                disabled={clearingContext}
                title="Send /clear to reset Claude's context window"
                className="flex items-center gap-1.5 rounded-2xl border border-border-subtle bg-surface-overlay px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-status-warning disabled:opacity-50"
              >
                {clearingContext ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
                Clear context
              </button>
            )}
          </div>
        )}

        {/* Custom prompt */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && custom.trim() && sendCustom()}
            onFocus={() => setCustomFocused(true)}
            onBlur={() => setCustomFocused(false)}
            placeholder="Custom prompt…"
            className="ui-input min-w-0 flex-1"
          />
          <button
            onClick={sendCustom}
            disabled={!custom.trim() || sending !== null}
            className="rounded-2xl bg-accent-primary px-4 py-3.5 text-text-inverted transition-colors hover:bg-accent-hover disabled:opacity-40 sm:px-5"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Recent custom prompt chips — click to reuse */}
        {project.recentCustomPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {project.recentCustomPrompts.map((r, i) => (
              <button
                key={i}
                onClick={() => setCustom(r.customPrompt)}
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
      </>
      )}
    </div>
  );
}
