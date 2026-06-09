"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactRelativeDate } from "@/lib/dates";
import type { ProjectState } from "@/lib/control-types";
import type { ProjectOperationsSnapshot } from "./control-presenter";
import { STATE_DEFINITIONS } from "@/lib/control-states";
import { ProjectCard } from "./ProjectCard";

type CardBaseProps = Omit<Parameters<typeof ProjectCard>[0], "snapshot" | "isOnlyReady">;
type ProjectRailSort = "priority" | "recent" | "az";

function snapshotActivityMs(snapshot: ProjectOperationsSnapshot): number {
  const project = snapshot.project;
  return Math.max(
    snapshot.evidenceAt ?? 0,
    project.session?.mtime ?? 0,
    project.latestOrchestrationRun?.finishedAt ? Date.parse(project.latestOrchestrationRun.finishedAt) : 0,
    project.latestOrchestrationRun?.startedAt ? Date.parse(project.latestOrchestrationRun.startedAt) : 0,
    project.recentInjections[0]?.dispatchedAt ? Date.parse(project.recentInjections[0].dispatchedAt) : 0,
  );
}

export function ProjectOperationsView({
  snapshots,
  selectedTab,
  onSelect,
  cardProps,
}: {
  snapshots: ProjectOperationsSnapshot[] | null;
  selectedTab: string | null;
  onSelect: (tab: string) => void;
  cardProps: (project: ProjectState) => CardBaseProps;
  onBootstrap: () => void;
  onNewProject: () => void;
  runtimeAvailable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectRailSort>("priority");
  const sourceSnapshots = useMemo(() => snapshots ?? [], [snapshots]);

  // Counter categories are sourced from STATE_DEFINITIONS via the SSOT, so
  // the badge on the row and the count in the chip can never disagree:
  // "X working" counts ProjectStateKeys whose counterCategory === "working",
  // "Y awaiting input" counts category === "waiting" (covers ready,
  // orchestration_ready, AND open_idle — all three states where the user's
  // next action is "type a prompt"), "Z open" counts category === "idle".
  const isWaiting = (snapshot: ProjectOperationsSnapshot) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "waiting";
  const isWorking = (snapshot: ProjectOperationsSnapshot) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "working";
  const isIdle = (snapshot: ProjectOperationsSnapshot) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "idle";
  const readyCount = sourceSnapshots.filter(isWaiting).length;
  const workingCount = sourceSnapshots.filter(isWorking).length;
  const openIdleCount = sourceSnapshots.filter(isIdle).length;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSnapshots = useMemo(() => {
    const filtered = normalizedQuery
      ? sourceSnapshots.filter((snapshot) => {
          const haystack = [
            snapshot.project.tab,
            snapshot.project.profile?.mission,
            snapshot.project.profile?.description,
            snapshot.project.dir,
            snapshot.project.git?.branch,
            snapshot.contextSummary,
          ].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : sourceSnapshots;

    return [...filtered].sort((a, b) => {
      if (sort === "az") return a.project.tab.localeCompare(b.project.tab);
      if (sort === "recent") return snapshotActivityMs(b) - snapshotActivityMs(a) || a.project.tab.localeCompare(b.project.tab);
      return sourceSnapshots.indexOf(a) - sourceSnapshots.indexOf(b);
    });
  }, [normalizedQuery, sourceSnapshots, sort]);
  const selected =
    sourceSnapshots.find((snapshot) => snapshot.project.tab === selectedTab) ??
    visibleSnapshots[0] ??
    sourceSnapshots[0];

  if (!snapshots) {
    return <div className="ui-card-shell h-72 animate-pulse" />;
  }

  if (sourceSnapshots.length === 0) {
    // Empty state moved one level up to ControlPanel → EmptyStateWelcome
    // (2026-06-05 audit: this view was rendering a second, less-discoverable
    // empty state below the welcome card). Returning null here lets the
    // welcome card breathe alone; callers that don't render the welcome
    // (none today) would need to handle their own zero-state.
    return null;
  }

  return (
    <section className="ui-control-workspace">
      <aside className="ui-control-project-rail">
        <div className="border-b border-border-subtle px-4 pb-3 pt-4">
          <h2 className="text-sm font-semibold text-text-primary">Projects</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {workingCount} working · {readyCount} ready · {openIdleCount} open
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find project"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {([
              ["priority", "Priority"],
              ["recent", "Recent"],
              ["az", "A-Z"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={cn(
                  "rounded-md px-2 py-1 text-micro transition-colors",
                  sort === id
                    ? "bg-accent-muted text-accent-text"
                    : "text-text-muted hover:bg-surface-overlay hover:text-text-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="ui-control-project-list">
          {visibleSnapshots.length === 0 && (
            <p className="px-3 py-4 text-sm text-text-muted">No projects match “{query.trim()}”.</p>
          )}
          {visibleSnapshots.map((snapshot) => {
            const active = snapshot.project.tab === selected.project.tab;
            const stateDef = STATE_DEFINITIONS[snapshot.phase];
            const dotClass = stateDef.dotClass;
            const duplicateEvidence = snapshot.evidenceLabel === snapshot.display.stateLabel;
            const evidence = duplicateEvidence
              ? snapshot.evidenceAt
                ? compactRelativeDate(new Date(snapshot.evidenceAt))
                : null
              : snapshot.evidenceAt
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
                  {evidence && <span className="mt-0.5 block truncate text-micro text-text-muted">{evidence}</span>}
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
