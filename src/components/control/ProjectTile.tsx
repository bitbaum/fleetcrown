"use client";

import { useState } from "react";
import { Loader2, Play, Focus, Trash2 } from "lucide-react";
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

type RemoveStage = "idle" | "confirm" | "removing";

/** Trash icon used in the action row when stage === "idle". */
function RemoveTriggerIcon({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title="Remove from fleet"
      aria-label="Remove from fleet"
      className="ui-icon-action hover:text-status-negative"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** Full-row confirm strip — replaces the entire chips+icons row while
 *  stage !== "idle" so narrow tiles don't need to squeeze Yes/No alongside Launch. */
function RemoveConfirmStrip({
  projectName,
  removing,
  error,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  removing: boolean;
  error: string | null;
  onConfirm: (e: React.MouseEvent) => void;
  onCancel: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs text-text-tertiary truncate">
        Remove <span className="text-text-secondary">{projectName}</span>?
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          disabled={removing}
          className="inline-flex items-center gap-1 text-xs font-medium text-status-negative transition-colors hover:opacity-80 disabled:opacity-50"
        >
          {removing ? <Loader2 className="ui-spinner-xs" /> : null}
          Yes, remove
        </button>
        <button
          onClick={onCancel}
          disabled={removing}
          className="text-xs text-text-muted transition-colors hover:text-text-secondary disabled:opacity-50"
        >
          No
        </button>
      </div>
      {error && <p className="ui-error-xs w-full">{error}</p>}
    </div>
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
    ? `Saved agent handoff: ${new Date(session.mtime).toLocaleString(APP_LOCALE)}`
    : null;
  const [launching, setLaunching] = useState(false);
  const canLaunch = !!dir;

  // Lift remove-confirm state into the tile so the strip can replace the whole
  // action row instead of squeezing Yes/No alongside Focus + Launch on narrow widths.
  const [removeStage, setRemoveStage] = useState<RemoveStage>("idle");
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removeEnabled = !!onRemoved && !!project.id;

  const handleLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canLaunch || launching) return;
    setLaunching(true);
    try { onLaunch(); } finally { setLaunching(false); }
  };

  const handleRemoveConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRemoved || !project.id) return;
    haptic();
    setRemoveStage("removing");
    setRemoveError(null);
    try {
      const res = await deleteJson(`/api/user-projects/${project.id}`);
      if (!res.ok) await throwApiError(res, "Failed to remove");
      onRemoved();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Failed to remove");
      setRemoveStage("confirm");
    }
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

      <div className="border-t border-border-subtle pt-3">
        {removeStage !== "idle" ? (
          <RemoveConfirmStrip
            projectName={tab}
            removing={removeStage === "removing"}
            error={removeError}
            onConfirm={handleRemoveConfirm}
            onCancel={(e) => { e.stopPropagation(); setRemoveStage("idle"); setRemoveError(null); }}
          />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <ProjectStatusChips project={project} tabOpen={tabOpen} compact isAgentWorking={display.isAgentWorking} />

            <div className="flex items-center gap-1.5">
              {removeEnabled && (
                <RemoveTriggerIcon onClick={(e) => { e.stopPropagation(); setRemoveStage("confirm"); }} />
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
        )}
      </div>
    </div>
  );
}
