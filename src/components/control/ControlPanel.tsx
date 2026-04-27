"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import { READY_WINDOW_S, CLOSED_WINDOW_S, CLOSING_WINDOW_S } from "@/lib/constants/control";
import type { ControlData } from "@/app/api/control/route";
import { ProjectCard } from "./ProjectCard";

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
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      await refresh();
      inFlight.current = false;
    };

    poll();

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
  const running = data?.projects.filter((p) => p.claudeRunning).length ?? 0;
  const waitingCount = data?.projects.filter(
    (p) =>
      !p.claudeRunning &&
      p.readyAt !== null &&
      nowS - p.readyAt < READY_WINDOW_S &&
      !(p.closedAt !== null && nowS - p.closedAt < CLOSED_WINDOW_S) &&
      !(p.closingAt !== null && nowS - p.closingAt < CLOSING_WINDOW_S)
  ).length ?? 0;
  const todayCommits = data?.projects.reduce((sum, p) => sum + (p.git?.todayCount ?? 0), 0) ?? 0;
  const total = data?.projects.length ?? 0;

  const sorted = data
    ? [...data.projects].sort((a, b) => {
        const nowS2 = Math.floor(Date.now() / 1000);
        const aReady  = !a.claudeRunning && a.readyAt !== null && nowS2 - a.readyAt < READY_WINDOW_S;
        const bReady  = !b.claudeRunning && b.readyAt !== null && nowS2 - b.readyAt < READY_WINDOW_S;
        const aClosed = a.closedAt !== null && nowS2 - a.closedAt < CLOSED_WINDOW_S;
        const bClosed = b.closedAt !== null && nowS2 - b.closedAt < CLOSED_WINDOW_S;
        if (aClosed && !bClosed) return -1;
        if (!aClosed && bClosed) return 1;
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;
        if (a.claudeRunning && !b.claudeRunning) return -1;
        if (!a.claudeRunning && b.claudeRunning) return 1;
        const aActive = (a.git?.todayCount ?? 0) > 0;
        const bActive = (b.git?.todayCount ?? 0) > 0;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return 0;
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between text-xs text-white/40">
        <span>
          {total > 0 ? (
            <>
              {running > 0 && <span className="text-indigo-400">{running} running</span>}
              {running > 0 && (waitingCount > 0 || todayCommits > 0) && " · "}
              {waitingCount > 0 && <span className="text-emerald-400">{waitingCount} waiting</span>}
              {waitingCount > 0 && todayCommits > 0 && " · "}
              {todayCommits > 0 && <span>+{todayCommits} commits today</span>}
              {running === 0 && waitingCount === 0 && todayCommits === 0 && `${total} projects`}
            </>
          ) : "Loading…"}
          {lastUpdated && ` · ${timeAgo(lastUpdated)}`}
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

      {/* Zellij open tabs strip */}
      {data && data.zellijTabs.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Terminal className="h-3 w-3 text-white/20 shrink-0" />
          {data.zellijTabs.map((t) => {
            const hasProject = data.projects.some(
              (p) => p.tab.toLowerCase() === t.toLowerCase()
            );
            return (
              <span
                key={t}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded font-mono",
                  hasProject ? "text-white/50 bg-white/5" : "text-white/20 bg-white/[0.02]"
                )}
              >
                {t}
              </span>
            );
          })}
        </div>
      )}

      {sorted ? (
        sorted.length > 0 ? (
          <div className="space-y-3">
            {sorted.map((project) => (
              <ProjectCard
                key={project.tab}
                project={project}
                prompts={data!.prompts}
                zellijTabs={data!.zellijTabs}
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
