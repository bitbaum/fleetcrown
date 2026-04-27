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

function SessionBadge({ health }: { health: string }) {
  const color = HEALTH_COLOR[health] ?? "text-white/40";
  return <span className={cn("text-xs font-semibold uppercase", color)}>{health}</span>;
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
      <span className="text-xs text-white/30">{maturity.replace(/^\d+\/10\s*-?\s*/, "")}</span>
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
    <div className="border-t border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-sm font-semibold text-emerald-300">Session closed</span>
        {git?.todayCount ? (
          <span className="text-xs text-white/30 ml-auto">+{git.todayCount} commits today</span>
        ) : null}
      </div>

      {session && (
        <div className="space-y-2">
          {session.done && (
            <div className="space-y-0.5">
              <p className="text-xs text-white/30 uppercase tracking-wide">Shipped</p>
              <p className="text-sm text-white/80 leading-relaxed">{session.done}</p>
            </div>
          )}
          {session.next && (
            <div className="space-y-0.5">
              <p className="text-xs text-white/30 uppercase tracking-wide">Up next (when ready)</p>
              <p className="text-sm text-white/60 leading-relaxed">{session.next}</p>
            </div>
          )}
          {session.tests && (
            <p className="text-xs text-white/30">{session.tests}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onContinue}
          className="flex-1 px-3 py-2 rounded-md text-sm font-medium bg-white/8 hover:bg-white/12 text-white/70 hover:text-white/90 transition-colors"
        >
          Continue →
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-2 rounded-md text-sm text-white/30 hover:text-white/60 transition-colors"
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
    <div className="border-t border-amber-500/20 bg-amber-500/[0.03] px-4 py-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
        <span className="text-xs font-medium text-amber-300">Closing session…</span>
        <span className="text-xs text-white/30 ml-auto">{secondsAgo(startedAt)}s running</span>
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
    <div className="border-t border-indigo-500/20 bg-indigo-500/[0.03] px-4 py-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3 w-3 text-indigo-400 animate-spin shrink-0" />
        <span className="text-xs text-indigo-300 truncate">{label}</span>
        <span className="text-xs text-white/30 ml-auto shrink-0">{secondsAgo(startedAt)}s</span>
      </div>
    </div>
  );
}

function ReadyBanner({
  prompts,
  onSend,
  onDismiss,
}: {
  prompts: PromptMeta[];
  onSend: (key: string) => void;
  onDismiss: () => void;
}) {
  const [seconds, setSeconds] = useState(AUTO_INJECT_S);
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";

  useEffect(() => {
    if (seconds <= 0) { onSend(primaryKey); return; }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, onSend, primaryKey]);

  return (
    <div className="border-t border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-400">Claude finished</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 tabular-nums">{seconds}s</span>
          <button onClick={onDismiss} className="text-xs text-white/30 hover:text-white/60 transition-colors">
            dismiss
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {prompts.filter((p) => p.style === "primary" || p.style === "action").map((p) => (
          <button
            key={p.key}
            onClick={() => onSend(p.key)}
            className={cn(
              "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              p.style === "primary"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                : "bg-white/10 hover:bg-white/15 text-white/80"
            )}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>
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
    <div className="border-t border-white/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-white/30 hover:text-white/50 transition-colors"
      >
        <span className="flex items-center gap-1">
          <Info className="h-3 w-3" />
          Profile
        </span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {profile.description && (
            <p className="text-xs text-white/50 leading-relaxed">{profile.description}</p>
          )}
          {profile.mission && (
            <div>
              <p className="text-xs text-white/25 uppercase tracking-wide mb-0.5">Mission</p>
              <p className="text-xs text-white/60 leading-relaxed italic">{profile.mission}</p>
            </div>
          )}
          {profile.maturity && (
            <div>
              <p className="text-xs text-white/25 uppercase tracking-wide mb-1">Maturity</p>
              <MaturityBar maturity={profile.maturity} />
            </div>
          )}
          {displayAttrs
            .filter(([k]) => !["description", "mission", "maturity"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-white/25 uppercase tracking-wide mb-0.5">
                  {keyAttrLabels[k] ?? k}
                </p>
                {k === "url" ? (
                  <a
                    href={v.startsWith("http") ? v : `https://${v}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {v} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  <p className="text-xs text-white/50 leading-relaxed">{v}</p>
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
  onInject,
}: {
  project: ProjectState;
  prompts: PromptMeta[];
  zellijTabs: string[];
  onInject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
}) {
  const [showMore, setShowMore] = useState(false);
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const nowS = Math.floor(Date.now() / 1000);
  const isClosed =
    !dismissed &&
    !project.claudeRunning &&
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
    !project.claudeRunning &&
    project.readyAt !== null &&
    nowS - project.readyAt < READY_WINDOW_S;

  const showRunning =
    !isClosing &&
    project.currentPrompt !== null &&
    project.claudeRunning;

  const send = async (promptKey?: string, customPrompt?: string) => {
    setSending(promptKey ?? "custom");
    setDismissed(true);
    try {
      await onInject(project.tab, promptKey, customPrompt || undefined);
      if (!promptKey) setCustom("");
    } finally {
      setSending(null);
    }
  };

  const primaryPrompts = prompts.filter((p) => p.style === "primary");
  const actionPrompts  = prompts.filter((p) => p.style === "action");
  const morePrompts    = prompts.filter((p) => p.style === "more");

  const tabOpen = zellijTabs.some(
    (t) => t.toLowerCase() === project.tab.toLowerCase()
  );

  const { git, session, profile } = project;

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        isClosed
          ? "border-emerald-500/30 bg-emerald-500/[0.02]"
          : isClosing
          ? "border-amber-500/25 bg-amber-500/[0.02]"
          : isReady
          ? "border-emerald-500/40 bg-emerald-500/[0.03]"
          : project.claudeRunning
          ? "border-indigo-500/25 bg-indigo-500/[0.02]"
          : "border-white/10 bg-white/[0.03]"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Circle
            className={cn(
              "h-2.5 w-2.5 shrink-0 fill-current",
              project.claudeRunning
                ? "text-indigo-400 animate-pulse"
                : isClosed
                ? "text-emerald-400"
                : isReady
                ? "text-emerald-400"
                : "text-white/20"
            )}
          />
          <span className="font-semibold text-white truncate">{project.tab}</span>
          {tabOpen && <Terminal className="h-3 w-3 text-white/25 shrink-0" />}
          {session?.health && <SessionBadge health={session.health} />}
          {profile?.status && !session?.health && (
            <span className="text-xs text-white/30 truncate">{profile.status}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {git && (
            <div className="flex items-center gap-1 text-xs text-white/40">
              <GitBranch className="h-3 w-3" />
              <span>{git.branch}</span>
              {git.dirty && <span className="text-amber-400">✎</span>}
              {git.todayCount > 0 && <span className="text-emerald-400/70">+{git.todayCount}</span>}
            </div>
          )}
          {profile?.url && (
            <a
              href={profile.url.startsWith("http") ? profile.url : `https://${profile.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/20 hover:text-white/50 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Session summary + recent commits (skip when closed banner shows it) */}
      {!isClosed && (session || git) && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-white/5 pt-3">
          {session?.done && (
            <p className="text-xs text-white/50 line-clamp-2">
              <span className="text-white/25">done: </span>{session.done}
            </p>
          )}
          {session?.next && (
            <p className="text-xs text-white/70 line-clamp-2">
              <span className="text-white/40">next: </span>{session.next}
            </p>
          )}
          {git?.recentCommits && git.recentCommits.length > 0 && (
            <div className="pt-0.5 space-y-0.5">
              {git.recentCommits.slice(0, 4).map((c, i) => {
                const spaceIdx = c.indexOf(" ");
                const hash = c.slice(0, spaceIdx);
                const desc = c.slice(spaceIdx + 1);
                return (
                  <p key={i} className="text-xs text-white/25 truncate font-mono">
                    <span className="text-white/15 mr-1">{hash}</span>
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
        />
      )}
      {showRunning && (
        <RunningBanner
          label={project.currentPrompt!.label}
          startedAt={project.currentPrompt!.startedAt}
        />
      )}

      {/* Profile — collapsible */}
      {profile && <ProfilePanel profile={profile} />}

      {/* Always-visible prompt buttons */}
      <div className="px-4 pb-3 pt-2 space-y-2 border-t border-white/5">
        <div className="flex flex-wrap gap-1.5">
          {[...primaryPrompts, ...actionPrompts].map((p) => (
            <button
              key={p.key}
              onClick={() => send(p.key)}
              disabled={sending !== null}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
                PROMPT_STYLE[p.style] ?? PROMPT_STYLE.action
              )}
            >
              {sending === p.key ? "…" : `${p.icon} ${p.label}`}
            </button>
          ))}
          {morePrompts.length > 0 && (
            <button
              onClick={() => setShowMore((v) => !v)}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 text-white/50 transition-colors flex items-center gap-1"
            >
              More {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {showMore && (
          <div className="flex flex-wrap gap-1.5">
            {morePrompts.map((p) => (
              <button
                key={p.key}
                onClick={() => send(p.key)}
                disabled={sending !== null}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
                  PROMPT_STYLE.more
                )}
              >
                {sending === p.key ? "…" : `${p.icon} ${p.label}`}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && custom.trim() && send(undefined, custom.trim())}
            placeholder="Custom prompt…"
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-white/25 min-w-0"
          />
          <button
            onClick={() => custom.trim() && send(undefined, custom.trim())}
            disabled={!custom.trim() || sending !== null}
            className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 text-white/70 disabled:opacity-40 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
