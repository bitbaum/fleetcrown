"use client";

import { useState } from "react";
import { Loader2, GitBranch, Play, Terminal, Focus } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_COLOR, getHealthShort } from "@/lib/constants/control";
import type { ProjectState } from "@/lib/control-types";

type Props = {
  project: ProjectState;
  currentAdapter: string;
  zellijTabs: string[];
  onExpand: () => void;
  onLaunch: () => void;
  onFocus: () => void;
};

export function ProjectTile({ project, currentAdapter, zellijTabs, onExpand, onLaunch, onFocus }: Props) {
  const { tab, git, session, agentRunning, dir } = project;
  const tabOpen = zellijTabs.some((t) => t.toLowerCase() === (project.liveTab ?? tab).toLowerCase());
  const healthColor = session?.health ? (HEALTH_COLOR[getHealthShort(session.health)] ?? "text-text-muted") : null;
  const [launching, setLaunching] = useState(false);
  const canLaunch = !!dir;

  const handleLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canLaunch || launching) return;
    setLaunching(true);
    try { onLaunch(); } finally { setLaunching(false); }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onExpand()}
      className="ui-card-shell ui-panel-interactive flex w-full cursor-pointer flex-col gap-3 px-4 py-4 text-left"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {agentRunning ? (
            <Loader2 className="ui-spinner-sm text-accent-text" />
          ) : (
            <span className={cn(
              "block h-2.5 w-2.5 rounded-full border",
              healthColor ? "border-transparent bg-current" : "border-border-default bg-transparent",
              healthColor ?? "text-border-default",
            )} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">{tab}</span>
            {tabOpen && (
              <span title="Terminal open" className="ui-tag ui-tag-neutral gap-1">
                <Terminal className="h-3 w-3" />
                Open
              </span>
            )}
          </div>
          {session?.next ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-tertiary" title={session.next}>{session.next}</p>
          ) : session?.done ? (
            <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-text-muted" title={session.done}>Last: {session.done}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-tertiary">
          {git?.branch && (
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              <span className="max-w-[10rem] truncate">{git.branch}</span>
            </span>
          )}
          {session?.health && (
            <span className={cn("font-medium uppercase tracking-caps", healthColor ?? "text-text-muted")}>
              {getHealthShort(session.health)}
            </span>
          )}
          {(git?.todayCount ?? 0) > 0 && (
            <span className="text-status-positive/80" title={`${git!.todayCount} commit${git!.todayCount > 1 ? "s" : ""} today`}>
              +{git!.todayCount}
            </span>
          )}
          {git?.dirty && (
            <span className="text-status-warning" title="Uncommitted changes">✎</span>
          )}
          {(git?.behindRemote ?? 0) > 0 && (
            <span className="text-status-warning" title={`${git!.behindRemote} commit${git!.behindRemote > 1 ? "s" : ""} behind remote`}>
              ↓{git!.behindRemote}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onFocus(); }}
            title="Focus on this project"
            className="ui-icon-action"
          >
            <Focus className="h-3.5 w-3.5" />
          </button>
          {canLaunch && !agentRunning && (
            <button
              onClick={handleLaunch}
              disabled={launching}
              title={project.agentPref
                ? `Launch ${project.agentPref}${project.modelPref ? ` · ${project.modelPref}` : ""} in ${tab}`
                : `Launch ${currentAdapter} in ${tab}`}
              className="ui-chip-action-compact inline-flex items-center gap-1.5"
            >
              {launching ? <Loader2 className="ui-spinner-xs" /> : <Play className="h-3 w-3" />}
              {project.agentPref ? `${project.agentPref}${project.modelPref ? ` · ${project.modelPref}` : ""}` : "Launch"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
