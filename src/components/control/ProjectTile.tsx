"use client";

import { useState } from "react";
import { Loader2, GitBranch, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_COLOR } from "@/lib/constants/control";
import type { ProjectState } from "@/app/api/control/route";

type Props = {
  project: ProjectState;
  currentAdapter: string;
  onExpand: () => void;
  onLaunch: () => Promise<void>;
};

export function ProjectTile({ project, currentAdapter, onExpand, onLaunch }: Props) {
  const { tab, git, session, agentRunning, dir } = project;
  const healthColor = session?.health ? (HEALTH_COLOR[session.health] ?? "text-text-muted") : null;
  const [launching, setLaunching] = useState(false);
  const canLaunch = !!dir;

  const handleLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canLaunch || launching) return;
    setLaunching(true);
    try { await onLaunch(); } finally { setLaunching(false); }
  };

  return (
    <button
      onClick={onExpand}
      className="ui-panel flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-raised"
    >
      {/* Status dot / spinner */}
      <div className="mt-0.5 shrink-0">
        {agentRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-text" />
        ) : (
          <span className={cn(
            "block h-2 w-2 rounded-full border",
            healthColor ? "border-transparent bg-current" : "border-border-default bg-transparent",
            healthColor ?? "text-border-default",
          )} />
        )}
      </div>

      {/* Name + next */}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-text-primary">{tab}</span>
        {session?.next && (
          <p className="mt-0.5 truncate text-xs text-text-tertiary">{session.next}</p>
        )}
      </div>

      {/* Branch + health + launch */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {git?.branch && (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <GitBranch className="h-3 w-3" />
              {git.branch}
            </span>
          )}
          {canLaunch && !agentRunning && (
            <button
              onClick={handleLaunch}
              disabled={launching}
              title={`Launch ${currentAdapter} in ${tab}`}
              className="rounded-full p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-accent-text"
            >
              {launching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            </button>
          )}
        </div>
        {session?.health && (
          <span className={cn("text-[10px] font-medium uppercase tracking-wide", healthColor ?? "text-text-muted")}>
            {session.health}
          </span>
        )}
      </div>
    </button>
  );
}
