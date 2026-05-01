"use client";

import { useState, useEffect } from "react";
import {
  GitBranch, Circle, Send, ChevronDown, ChevronUp,
  Zap, CheckCircle2, Loader2, ExternalLink, Info, ChevronRight, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { secondsAgo } from "@/lib/dates";
import {
  READY_WINDOW_S, CLOSED_WINDOW_S, CLOSING_WINDOW_S, AUTO_INJECT_S,
  HEALTH_COLOR, PROMPT_STYLE,
} from "@/lib/constants/control";
import type { ProjectState, PromptMeta } from "@/app/api/control/route";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { ProjectProfile } from "./ProjectProfile";

const PRIMARY_INTENTS: Array<{ id: OrchestrationTaskIntentId; label: string }> = [
  { id: "next_best", label: "Next best" },
];
const ACTION_INTENTS: Array<{ id: OrchestrationTaskIntentId; label: string }> = [
  { id: "test_and_fix", label: "Test & fix" },
  { id: "quality", label: "Quality" },
  { id: "commit_push", label: "Commit" },
];
const MORE_INTENTS: Array<{ id: OrchestrationTaskIntentId; label: string }> = [
  { id: "full_audit", label: "Full audit" },
  { id: "product", label: "Product review" },
  { id: "ux_review", label: "UX review" },
  { id: "deploy_check", label: "Deploy check" },
  { id: "close_session", label: "Close session" },
];

function SessionBadge({ health }: { health: string }) {
  const color = HEALTH_COLOR[health] ?? "text-white/40";
  return <span className={cn("rounded-full border border-border-default bg-surface-overlay px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em]", color)}>{health}</span>;
}

function MaturityBar({ maturity }: { maturity: string }) {
  const m = maturity.match(/^(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              i < n ? "bg-indigo-400" : "bg-white/10"
            )}
          />
        ))}
      </div>
      <span className="text-sm text-text-secondary">{maturity.replace(/^\d+\/10\s*-?\s*/, "")}</span>
    </div>
  );
}

function ClosedBanner({
  session,
  git,
  onContinue,
  onDismiss,
}: {
  session: ProjectState["session"];
  git: ProjectState["git"];
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-base font-medium text-emerald-300">Session closed</span>
        {git?.todayCount ? (
          <span className="ml-auto text-sm text-text-secondary">+{git.todayCount} commits today</span>
        ) : null}
      </div>

      {session && (
        <div className="space-y-2">
          {session.done && (
            <div className="space-y-0.5">
              <p className="ui-kicker">Shipped</p>
              <p className="text-base text-text-primary leading-relaxed">{session.done}</p>
            </div>
          )}
          {session.next && (
            <div className="space-y-0.5">
              <p className="ui-kicker">Up next</p>
              <p className="text-base text-text-secondary leading-relaxed">{session.next}</p>
            </div>
          )}
          {session.tests && (
            <p className="text-sm text-text-tertiary">{session.tests}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onContinue}
          className="flex-1 rounded-2xl bg-surface-overlay px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-raised"
        >
          Continue →
        </button>
        <button
          onClick={onDismiss}
          className="rounded-2xl px-4 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function ClosingBanner({ startedAt }: { startedAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="border-t border-amber-500/20 bg-amber-500/[0.04] px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
        <span className="text-sm font-medium text-amber-300">Closing session…</span>
        <span className="ml-auto text-sm text-text-secondary">{secondsAgo(startedAt)}s running</span>
      </div>
    </div>
  );
}

function RunningBanner({ label, startedAt }: { label: string; startedAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="border-t border-indigo-500/20 bg-indigo-500/[0.04] px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="h-3 w-3 text-indigo-400 animate-spin shrink-0" />
        <span className="truncate text-sm text-indigo-200">{label}</span>
        <span className="ml-auto shrink-0 text-sm text-text-secondary">{secondsAgo(startedAt)}s</span>
      </div>
    </div>
  );
}

function ReadyBanner({
  prompts,
  onSend,
  onDismiss,
  paused = false,
  title = "Agent finished",
}: {
  prompts: PromptMeta[];
  onSend: (key: string) => void;
  onDismiss: () => void;
  paused?: boolean;
  title?: string;
}) {
  const [seconds, setSeconds] = useState(AUTO_INJECT_S);
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";

  useEffect(() => {
    if (paused) return; // freeze while user is composing a custom prompt
    if (seconds <= 0) { onSend(primaryKey); return; }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, paused, onSend, primaryKey]);

  return (
    <div className="border-t border-emerald-500/30 bg-emerald-500/6 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-300">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary tabular-nums">{paused ? "Paused" : `${seconds}s`}</span>
          <button onClick={onDismiss} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
            dismiss
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.filter((p) => p.style === "primary" || p.style === "action").map((p) => (
          <button
            key={p.key}
            onClick={() => onSend(p.key)}
            className={cn(PROMPT_STYLE[p.style] ?? PROMPT_STYLE.action)}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LatestOrchestrationPanel({ run }: { run: NonNullable<ProjectState["latestOrchestrationRun"]> }) {
  return (
    <div className="space-y-3 border-t border-border-subtle px-5 pb-5 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-kicker">latest orchestration</span>
        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200">
          {run.adapter} · {run.intent}
        </span>
        <span className="rounded-full border border-border-subtle bg-surface-base px-2.5 py-1 text-xs text-text-secondary">
          {run.state}
        </span>
      </div>
      {run.summary?.done && (
        <p className="text-base text-text-secondary"><span className="mr-2 ui-kicker">done</span>{run.summary.done}</p>
      )}
      {run.summary?.next && (
        <p className="text-lg text-text-primary leading-snug"><span className="mr-2 ui-kicker">next</span>{run.summary.next}</p>
      )}
      {(run.summary?.tests || run.summary?.todos || run.summary?.health) && (
        <p className="text-sm text-text-tertiary">
          {[run.summary?.tests, run.summary?.todos, run.summary?.health].filter(Boolean).join(" · ")}
        </p>
      )}
      {!run.summary && run.payload?.resultText && (
        <p className="line-clamp-4 text-sm text-text-secondary leading-relaxed">{run.payload.resultText}</p>
      )}
      {run.payload?.error && (
        <p className="text-sm text-red-400">{run.payload.error}</p>
      )}
    </div>
  );
}

function ProfilePanel({ profile }: { profile: NonNullable<ProjectState["profile"]> }) {
  const [open, setOpen] = useState(false);

  const keyAttrLabels: Record<string, string> = {
    status: "Status", maturity: "Maturity", stack: "Stack", mission: "Mission",
    customers: "Customers", architecture: "Architecture", url: "URL",
    description: "Description", owner: "Owner", repo: "Repo",
  };

  const displayAttrs = Object.entries(profile.attrs)
    .filter(([k]) => k in keyAttrLabels && profile.attrs[k])
    .slice(0, 8);

  if (!profile.description && !profile.status && !profile.mission && displayAttrs.length === 0) return null;

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <span className="flex items-center gap-1">
          <Info className="h-4 w-4" />
          Profile
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="space-y-4 px-5 pb-5">
          {profile.description && (
            <p className="text-sm text-text-secondary leading-relaxed">{profile.description}</p>
          )}
          {profile.mission && (
            <div>
              <p className="ui-kicker mb-1">Mission</p>
              <p className="text-sm text-text-secondary leading-relaxed italic">{profile.mission}</p>
            </div>
          )}
          {profile.maturity && (
            <div>
              <p className="ui-kicker mb-1.5">Maturity</p>
              <MaturityBar maturity={profile.maturity} />
            </div>
          )}
          {displayAttrs
            .filter(([k]) => !["description", "mission", "maturity"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <p className="ui-kicker mb-1">
                  {keyAttrLabels[k] ?? k}
                </p>
                {k === "url" ? (
                  <a
                    href={v.startsWith("http") ? v : `https://${v}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-accent-text hover:text-text-primary"
                  >
                    {v} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-sm text-text-secondary leading-relaxed">{v}</p>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

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
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

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
          ? "border-emerald-500/30 bg-emerald-500/[0.02]"
          : isClosing
          ? "border-amber-500/25 bg-amber-500/[0.02]"
          : isReady || isOrchReady
          ? "border-emerald-500/40 bg-emerald-500/[0.03]"
          : project.agentRunning
          ? "border-indigo-500/25 bg-indigo-500/[0.02]"
          : "border-white/10 bg-white/[0.03]"
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
                ? "text-indigo-400 animate-pulse"
                : isClosed
                ? "text-emerald-400"
                : isReady || isOrchReady
                ? "text-emerald-400"
                : "text-white/20"
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
            <div className="flex items-center gap-1.5 text-sm text-text-secondary">
              <GitBranch className="h-4 w-4" />
              <span className="max-w-[20rem] truncate" title={git.branch}>{git.branch}</span>
              {git.dirty && <span className="text-amber-400">✎</span>}
              {git.todayCount > 0 && <span className="text-emerald-400/70">+{git.todayCount}</span>}
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
          paused={customFocused || custom.trim().length > 0}
          title="Agent finished"
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
          paused={customFocused || custom.trim().length > 0}
          title="Task finished"
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
