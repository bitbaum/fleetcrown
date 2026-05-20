"use client";

import { useState } from "react";
import { Loader2, Play, Focus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectState } from "@/lib/control-types";
import { getProjectDisplayState } from "./control-presenter";
import { APP_LOCALE } from "@/lib/constants";
import { ProjectStatusChips } from "./ProjectStatusChips";
import { deleteJson, throwApiError } from "@/lib/api/fetch";
import { haptic } from "@/lib/haptics";

type Props = {
  project: ProjectState;
  currentAdapter: string;
  zellijTabs: string[];
  onExpand: () => void;
  onLaunch: () => void;
  onFocus: () => void;
  /** When provided, render an inline Trash2 → confirm flow that calls
   *  DELETE /api/user-projects/[id]. On success, this callback fires so
   *  the parent can refresh the fleet view. Only set on Stale-bucket tiles. */
  onRemoved?: () => void;
};

function TileRemoveButton({ projectId, onRemoved }: { projectId: string; onRemoved: () => void }) {
  const [stage, setStage] = useState<"idle" | "confirm" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);

  if (stage === "confirm" || stage === "removing") {
    const handleConfirm = async (e: React.MouseEvent) => {
      e.stopPropagation();
      haptic();
      setStage("removing");
      setError(null);
      try {
        const res = await deleteJson(`/api/user-projects/${projectId}`);
        if (!res.ok) await throwApiError(res, "Failed to remove");
        onRemoved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove");
        setStage("confirm");
      }
    };
    return (
      <div className="flex items-center gap-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
        <span className="text-text-tertiary">Remove?</span>
        <button
          onClick={handleConfirm}
          disabled={stage === "removing"}
          className="text-status-negative transition-colors hover:opacity-80 disabled:opacity-50"
        >
          {stage === "removing" ? <Loader2 className="ui-spinner-xs" /> : "Yes"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setStage("idle"); setError(null); }}
          className="text-text-muted transition-colors hover:text-text-secondary"
        >
          <X className="h-3 w-3" />
        </button>
        {error && <span className="ui-error-xs">{error}</span>}
      </div>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setStage("confirm"); }}
      title="Remove from fleet"
      aria-label="Remove from fleet"
      className="ui-icon-action hover:text-status-negative"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

export function ProjectTile({ project, currentAdapter, zellijTabs, onExpand, onLaunch, onFocus, onRemoved }: Props) {
  const { tab, session, agentRunning, dir } = project;
  const display = getProjectDisplayState(project, zellijTabs, Math.floor(Date.now() / 1000));
  const tabOpen = zellijTabs.some((t) => t.toLowerCase() === (project.liveTab ?? tab).toLowerCase());
  const { stateLabel, stateTagClass: stateClass } = display;
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
                : display.isClosing
                ? "border-status-warning text-status-warning"
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
        <ProjectStatusChips project={project} tabOpen={tabOpen} compact isAgentWorking={display.isAgentWorking} />

        <div className="flex items-center gap-1.5">
          {onRemoved && project.id && (
            <TileRemoveButton projectId={project.id} onRemoved={onRemoved} />
          )}
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
              {project.agentPref ?? "Launch"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
