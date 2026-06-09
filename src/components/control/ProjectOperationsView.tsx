"use client";

import { cn } from "@/lib/utils";
import { compactRelativeDate } from "@/lib/dates";
import type { ProjectState } from "@/lib/control-types";
import type { ProjectOperationsSnapshot } from "./control-presenter";
import { STATE_DEFINITIONS } from "@/lib/control-states";
import { ProjectCard } from "./ProjectCard";

type CardBaseProps = Omit<Parameters<typeof ProjectCard>[0], "snapshot" | "isOnlyReady">;

export function ProjectOperationsView({
  snapshots,
  selectedTab,
  onSelect,
  cardProps,
  onBootstrap,
  onNewProject,
  runtimeAvailable,
}: {
  snapshots: ProjectOperationsSnapshot[] | null;
  selectedTab: string | null;
  onSelect: (tab: string) => void;
  cardProps: (project: ProjectState) => CardBaseProps;
  onBootstrap: () => void;
  onNewProject: () => void;
  runtimeAvailable: boolean;
}) {
  if (!snapshots) {
    return <div className="ui-card-shell h-72 animate-pulse" />;
  }

  if (snapshots.length === 0) {
    // Empty state moved one level up to ControlPanel → EmptyStateWelcome
    // (2026-06-05 audit: this view was rendering a second, less-discoverable
    // empty state below the welcome card). Returning null here lets the
    // welcome card breathe alone; callers that don't render the welcome
    // (none today) would need to handle their own zero-state.
    return null;
  }

  const selected = snapshots.find((snapshot) => snapshot.project.tab === selectedTab) ?? snapshots[0];
  // Counter categories are sourced from STATE_DEFINITIONS via the SSOT, so
  // the badge on the row and the count in the chip can never disagree:
  // "X working" counts ProjectStateKeys whose counterCategory === "working",
  // "Y awaiting input" counts category === "waiting" (covers ready,
  // orchestration_ready, AND open_idle — all three states where the user's
  // next action is "type a prompt"), "Z open" counts category === "idle".
  const isWaiting = (snapshot: typeof snapshots[number]) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "waiting";
  const isWorking = (snapshot: typeof snapshots[number]) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "working";
  const isIdle = (snapshot: typeof snapshots[number]) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "idle";
  const readyCount = snapshots.filter(isWaiting).length;
  const workingCount = snapshots.filter(isWorking).length;
  const openIdleCount = snapshots.filter(isIdle).length;

  return (
    <section className="ui-control-workspace">
      <aside className="ui-control-project-rail">
        <div className="border-b border-border-subtle px-4 pb-3 pt-4">
          <h2 className="text-sm font-semibold text-text-primary">Projects</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {workingCount} working · {readyCount} ready · {openIdleCount} open
          </p>
        </div>
        <div className="ui-control-project-list">
          {snapshots.map((snapshot) => {
            const active = snapshot.project.tab === selected.project.tab;
            const stateDef = STATE_DEFINITIONS[snapshot.phase];
            const dotClass = stateDef.dotClass;
            const evidence = snapshot.evidenceAt
              ? `${snapshot.evidenceLabel} ${compactRelativeDate(new Date(snapshot.evidenceAt))}`
              : snapshot.evidenceLabel;
            // Row-level tooltip combines the SSOT description with the
            // problem hint when one exists — same content the inline
            // action chip on the main badge shows, kept consistent here.
            const rowTitle = stateDef.problem
              ? `${stateDef.description}\n\n${stateDef.problem.hint}`
              : stateDef.description;
            return (
              <button
                key={snapshot.project.tab}
                onClick={() => onSelect(snapshot.project.tab)}
                className={cn("ui-control-project-row", active && "ui-control-project-row-active")}
                title={rowTitle}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotClass)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">{snapshot.project.tab}</span>
                    {snapshot.attentionReason && <span className="h-1.5 w-1.5 rounded-full bg-status-warning" title={snapshot.attentionReason} />}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-text-secondary">{snapshot.display.stateLabel}</span>
                  <span className="mt-0.5 block truncate text-micro text-text-muted">{evidence}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0">
        <ProjectCard
          key={selected.project.tab}
          {...cardProps(selected.project)}
          snapshot={selected}
          isOnlyReady={readyCount === 1 && isWaiting(selected)}
        />
      </div>
    </section>
  );
}
