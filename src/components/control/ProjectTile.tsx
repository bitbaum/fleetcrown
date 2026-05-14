"use client";

import { useState } from "react";
import { Loader2, Play, Focus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectState } from "@/lib/control-types";
import { getProjectDisplayState } from "./control-presenter";
import { APP_LOCALE } from "@/lib/constants";
import { ProjectStatusChips } from "./ProjectStatusChips";

type Props = {
  project: ProjectState;
  currentAdapter: string;
  zellijTabs: string[];
  onExpand: () => void;
  onLaunch: () => void;
  onFocus: () => void;
};

export function ProjectTile({ project, currentAdapter, zellijTabs, onExpand, onLaunch, onFocus }: Props) {
  const { tab, session, agentRunning, dir } = project;
  const display = getProjectDisplayState(project, zellijTabs, Math.floor(Date.now() / 1000));
  const tabOpen = zellijTabs.some((t) => t.toLowerCase() === (project.liveTab ?? tab).toLowerCase());
  const stateLabel = display.isClosed
    ? "Closed"
    : display.isReady || display.isOrchestrationReady
    ? "Waiting"
    : display.isRunning
    ? "Working"
    : display.isSessionOpen
    ? "Ready"
    : "Idle";
  const stateClass = display.isRunning
    ? "ui-tag ui-tag-warning"
    : display.isClosed || display.isReady || display.isOrchestrationReady
    ? "ui-tag ui-tag-positive"
    : "ui-tag ui-tag-neutral";
  const summary = project.currentPrompt && display.isRunning
    ? project.currentPrompt.label
    : display.isReady || display.isOrchestrationReady
    ? "Ready for the next prompt"
    : display.isSessionOpen
    ? "Send a prompt when you want work to start"
    : session?.mtime
    ? `Last agent handoff: ${new Date(session.mtime).toLocaleString(APP_LOCALE)}`
    : null;
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
          {display.isRunning ? (
            <Loader2 className="ui-spinner-sm text-accent-text" />
          ) : (
            <span className={cn(
              "block h-2.5 w-2.5 rounded-full border bg-current",
              display.isReady || display.isOrchestrationReady || display.isClosed
                ? "border-status-positive text-status-positive"
                : display.isSessionOpen
                ? "border-text-secondary text-text-secondary"
                : "border-border-default text-border-default",
            )} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">{tab}</span>
            <span className={stateClass}>{stateLabel}</span>
          </div>
          {summary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-tertiary" title={summary}>{summary}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <ProjectStatusChips project={project} tabOpen={tabOpen} compact />

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
