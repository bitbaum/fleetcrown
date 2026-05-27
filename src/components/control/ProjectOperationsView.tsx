"use client";

import { Activity, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactRelativeDate } from "@/lib/dates";
import type { ProjectState } from "@/lib/control-types";
import type { ProjectOperationsSnapshot } from "./control-presenter";
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
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border-default px-8 py-16 text-center">
        <Activity className="h-12 w-12 text-text-muted" />
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Register a project to begin</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
            Control tracks current agent work, queued instructions, and saved context for each project.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {runtimeAvailable && (
            <button onClick={onBootstrap} className="ui-btn-primary gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Bootstrap project
            </button>
          )}
          <button onClick={onNewProject} className={runtimeAvailable ? "ui-btn-secondary gap-1.5" : "ui-btn-primary gap-1.5"}>
            <Plus className="h-3.5 w-3.5" />
            Register existing project
          </button>
        </div>
      </div>
    );
  }

  const selected = snapshots.find((snapshot) => snapshot.project.tab === selectedTab) ?? snapshots[0];
  const readyCount = snapshots.filter((snapshot) => snapshot.phase === "waiting_for_user").length;
  const workingCount = snapshots.filter((snapshot) => snapshot.phase === "working").length;

  return (
    <section className="ui-control-workspace">
      <aside className="ui-control-project-rail">
        <div className="border-b border-border-subtle px-4 pb-3 pt-4">
          <h2 className="text-sm font-semibold text-text-primary">Projects</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {workingCount} working · {readyCount} waiting for you
          </p>
        </div>
        <div className="ui-control-project-list">
          {snapshots.map((snapshot) => {
            const active = snapshot.project.tab === selected.project.tab;
            const dotClass = snapshot.phase === "working"
              ? "bg-accent-primary animate-pulse"
              : snapshot.phase === "waiting_for_user" || snapshot.phase === "completed"
                ? "bg-status-positive"
                : snapshot.phase === "offline"
                  ? "bg-status-warning"
                  : "bg-border-default";
            const evidence = snapshot.evidenceAt
              ? `${snapshot.evidenceLabel} ${compactRelativeDate(new Date(snapshot.evidenceAt))}`
              : snapshot.evidenceLabel;
            return (
              <button
                key={snapshot.project.tab}
                onClick={() => onSelect(snapshot.project.tab)}
                className={cn("ui-control-project-row", active && "ui-control-project-row-active")}
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
          isOnlyReady={readyCount === 1 && selected.phase === "waiting_for_user"}
        />
      </div>
    </section>
  );
}
