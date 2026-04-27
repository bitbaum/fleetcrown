"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, GitBranch, Circle, Send, ChevronDown, ChevronUp, Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ControlData, ProjectState, PromptMeta } from "@/app/api/control/route";

const HEALTH_COLOR: Record<string, string> = {
  good: "text-emerald-400",
  degraded: "text-amber-400",
  critical: "text-red-400",
};

const PROMPT_STYLE: Record<string, string> = {
  primary: "bg-indigo-600 hover:bg-indigo-500 text-white",
  action:  "bg-white/10 hover:bg-white/15 text-white/90",
  more:    "bg-white/5 hover:bg-white/10 text-white/70",
};

const READY_WINDOW_S  = 600; // 10 min
const CLOSED_WINDOW_S = 3600; // 1 hour — celebration stays visible
const AUTO_INJECT_S   = 12;

function timeAgo(ms: number): string {
  const diff = Math.round((Date.now() - ms) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

function SessionBadge({ health }: { health: string }) {
  const color = HEALTH_COLOR[health] ?? "text-white/40";
  return <span className={cn("text-xs font-semibold uppercase", color)}>{health}</span>;
}

/** Green celebration shown after close_session — no auto-countdown, shows results */
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {session.tests && (
              <span className="text-xs text-white/40">{session.tests}</span>
            )}
            {git?.todayCount ? (
              <span className="text-xs text-white/40">+{git.todayCount} commits today</span>
            ) : null}
          </div>
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

/** Countdown banner shown after normal Claude exits */
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

function ProjectCard({
  project,
  prompts,
  onInject,
}: {
  project: ProjectState;
  prompts: PromptMeta[];
  onInject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
}) {
  const [showMore, setShowMore] = useState(false);
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const nowS = Math.floor(Date.now() / 1000);
  const isClosed =
    !dismissed &&
    project.closedAt !== null &&
    nowS - project.closedAt < CLOSED_WINDOW_S;
  const isReady =
    !dismissed &&
    !isClosed &&
    !project.claudeRunning &&
    project.readyAt !== null &&
    nowS - project.readyAt < READY_WINDOW_S;

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

  const { git, session } = project;

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        isClosed
          ? "border-emerald-500/30 bg-emerald-500/[0.02]"
          : isReady
          ? "border-emerald-500/40 bg-emerald-500/[0.03]"
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
                ? "text-emerald-400 animate-pulse"
                : isClosed || isReady
                ? "text-emerald-400"
                : "text-white/20"
            )}
          />
          <span className="font-semibold text-white truncate">{project.tab}</span>
          {session?.health && <SessionBadge health={session.health} />}
        </div>
        {git && (
          <div className="flex items-center gap-1.5 text-xs text-white/40 shrink-0">
            <GitBranch className="h-3 w-3" />
            <span>{git.branch}</span>
            {git.dirty && <span className="text-amber-400">✎</span>}
            {git.todayCount > 0 && <span className="text-white/30">+{git.todayCount}</span>}
          </div>
        )}
      </div>

      {/* Session summary (only when NOT showing closed banner — closed banner shows it) */}
      {!isClosed && session && (session.done || session.next) && (
        <div className="px-4 pb-3 space-y-1 border-t border-white/5 pt-3">
          {session.done && (
            <p className="text-xs text-white/50 line-clamp-2">
              <span className="text-white/30">done: </span>{session.done}
            </p>
          )}
          {session.next && (
            <p className="text-xs text-white/70 line-clamp-2">
              <span className="text-white/40">next: </span>{session.next}
            </p>
          )}
          {git?.lastMsg && (
            <p className="text-xs text-white/30 truncate">{git.lastWhen} · {git.lastMsg}</p>
          )}
        </div>
      )}

      {/* Celebration banner — close_session was used */}
      {isClosed && (
        <ClosedBanner
          session={session}
          git={git}
          onContinue={() => send(primaryPrompts[0]?.key ?? "next_best")}
          onDismiss={() => setDismissed(true)}
        />
      )}

      {/* Countdown banner — normal Claude exit */}
      {isReady && (
        <ReadyBanner
          prompts={prompts}
          onSend={(key) => send(key)}
          onDismiss={() => setDismissed(true)}
        />
      )}

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

export function ControlPanel() {
  const [data, setData] = useState<ControlData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/control");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setLastUpdated(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const poll = async () => {
      // Skip if tab is hidden or a request is already in flight — prevents server backlog
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      await refresh();
      inFlight.current = false;
    };

    poll();

    // Refresh immediately when tab becomes visible again
    const onVisibilityChange = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const id = setInterval(poll, 10_000);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const inject = async (tab: string, promptKey?: string, customPrompt?: string) => {
    const res = await fetch("/api/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, promptKey, customPrompt }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    setTimeout(refresh, 500);
  };

  const nowS = Math.floor(Date.now() / 1000);
  const waitingCount = data?.projects.filter(
    (p) => !p.claudeRunning && p.readyAt !== null && nowS - p.readyAt < READY_WINDOW_S
      && !(p.closedAt !== null && nowS - p.closedAt < CLOSED_WINDOW_S)
  ).length ?? 0;
  const running = data?.projects.filter((p) => p.claudeRunning).length ?? 0;
  const total   = data?.projects.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-white/40">
        <span>
          {total > 0
            ? `${running} active${waitingCount > 0 ? ` · ${waitingCount} waiting` : ""} · ${total} projects`
            : "Loading…"}
          {lastUpdated && ` · updated ${timeAgo(lastUpdated)}`}
        </span>
        <button
          onClick={() => refresh(true)}
          disabled={refreshing}
          className="flex items-center gap-1 hover:text-white/70 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-md px-3 py-2">{error}</p>}

      {data ? (
        data.projects.length > 0 ? (
          <div className="space-y-3">
            {[...data.projects]
              .sort((a, b) => {
                const nowS2 = Math.floor(Date.now() / 1000);
                const aReady = !a.claudeRunning && a.readyAt !== null && nowS2 - a.readyAt < READY_WINDOW_S;
                const bReady = !b.claudeRunning && b.readyAt !== null && nowS2 - b.readyAt < READY_WINDOW_S;
                if (aReady && !bReady) return -1;
                if (!aReady && bReady) return 1;
                if (a.claudeRunning && !b.claudeRunning) return -1;
                if (!a.claudeRunning && b.claudeRunning) return 1;
                return 0;
              })
              .map((project) => (
                <ProjectCard
                  key={project.tab}
                  project={project}
                  prompts={data.prompts}
                  onInject={inject}
                />
              ))}
          </div>
        ) : (
          <p className="text-sm text-white/40 text-center py-8">
            No projects in ~/.config/claude-projects.conf
          </p>
        )
      ) : (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-lg border border-white/10 bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
