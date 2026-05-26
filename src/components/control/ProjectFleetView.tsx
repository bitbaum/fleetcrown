"use client";

import { ChevronUp, ChevronDown, ChevronLeft, LayoutGrid, Plus, Sparkles } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "@/lib/utils";
import type { ProjectState } from "@/lib/control-types";
import { getProjectDisplayState } from "./control-presenter";
import { ProjectCard } from "./ProjectCard";
import { ProjectTile } from "./ProjectTile";
import { ProjectCommanderCard } from "./ProjectCommanderCard";

type CardBaseProps = Omit<Parameters<typeof ProjectCard>[0], "onCollapse" | "onFocus" | "isOnlyReady">;

interface ProjectFleetViewProps {
  viewMode: "full" | "commander";
  sorted: ProjectState[] | null;
  activeProjects: ProjectState[];
  idleProjects: ProjectState[];
  /** Idle projects with pending uncommitted work — surfaced as a separate subsection above the quiet pile. */
  idleNeedsAttention: ProjectState[];
  /** Idle projects with a clean tree, recently touched. */
  idleQuiet: ProjectState[];
  /** Dormant idle projects — session.mtime > 30 days old or no session. */
  idleStale: ProjectState[];
  focusedTab: string | null;
  setFocusedTab: (tab: string | null) => void;
  expandedTabs: Set<string>;
  setExpandedTabs: Dispatch<SetStateAction<Set<string>>>;
  idleOpen: boolean;
  setIdleOpen: Dispatch<SetStateAction<boolean>>;
  zellijTabs: string[];
  nowS: number;
  selectedAgent: string;
  soloReadyTab: string | null;
  openLaunchModal: (project: ProjectState) => void;
  cardProps: (project: ProjectState) => CardBaseProps;
  onBootstrap: () => void;
  onNewProject: () => void;
  /** Fired after a Stale tile's inline Remove succeeds — caller refreshes the fleet. */
  onProjectRemoved: () => void;
  /** True iff the server reports RUNTIME_AVAILABLE=true (local dev). False on
   *  the cloud control plane (cockpitapp.vercel.app), where AI-bootstrap is
   *  unavailable because /api/project/ai-brief requires the local claude CLI. */
  runtimeAvailable: boolean;
  /** False when cloud has no current daemon heartbeat, so cached live state is stale. */
  runtimeStateKnown: boolean;
}

export function ProjectFleetView({
  viewMode,
  sorted,
  activeProjects,
  idleProjects,
  idleNeedsAttention,
  idleQuiet,
  idleStale,
  focusedTab,
  setFocusedTab,
  expandedTabs,
  setExpandedTabs,
  idleOpen,
  setIdleOpen,
  zellijTabs,
  nowS,
  selectedAgent,
  soloReadyTab,
  openLaunchModal,
  cardProps,
  onBootstrap,
  onNewProject,
  runtimeAvailable,
  runtimeStateKnown,
  onProjectRemoved,
}: ProjectFleetViewProps) {
  const collapseTab = (tab: string) =>
    setExpandedTabs((tabs) => {
      const next = new Set(tabs);
      next.delete(tab);
      return next;
    });

  const expandTab = (tab: string) =>
    setExpandedTabs((tabs) => new Set([...tabs, tab]));

  if (!sorted) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ui-card-shell h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border-default px-8 py-16 text-center">
        <LayoutGrid className="h-12 w-12 text-text-muted" />
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Add your first project</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
            The control panel is your fleet view — register a project to track its agent sessions, git state, and next actions from one place.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {/* Bootstrap calls /api/project/ai-brief which requires the local
              claude CLI; it always 503s in cloud mode. Hide the button on
              cockpitapp so new users don't hit a meaningless error — they
              get the Register flow instead, which works DB-side. */}
          {runtimeAvailable && (
            <button onClick={onBootstrap} className="ui-btn-primary gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Bootstrap new project →
            </button>
          )}
          <button onClick={onNewProject} className={runtimeAvailable ? "ui-btn-secondary gap-1.5" : "ui-btn-primary gap-1.5"}>
            <Plus className="h-3.5 w-3.5" />
            Register existing project
          </button>
        </div>
        {!runtimeAvailable && (
          <p className="max-w-sm text-xs leading-relaxed text-text-muted">
            Bootstrap-with-AI is available once the local daemon + claude CLI are installed (see the &ldquo;Finish setup&rdquo; banner above).
          </p>
        )}
      </div>
    );
  }

  if (viewMode === "commander") {
    return (
      <div className="space-y-2">
        {sorted.map((project) => {
          const { onInject, onRunWithBrain } = cardProps(project);
          return (
            <ProjectCommanderCard
              key={project.tab}
              project={project}
              zellijTabs={zellijTabs}
              onInject={onInject}
              onRunWithBrain={onRunWithBrain}
              onLaunch={() => openLaunchModal(project)}
              runtimeStateKnown={runtimeStateKnown}
            />
          );
        })}
      </div>
    );
  }

  const visibleActive = focusedTab
    ? activeProjects.filter((p) => p.tab === focusedTab)
    : activeProjects;

  const visibleIdleInFocus = focusedTab
    ? idleProjects.filter((p) => p.tab === focusedTab)
    : [];

  return (
    <div className="space-y-4">
      {focusedTab && (
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setFocusedTab(null)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-default hover:text-text-primary"
          >
            <ChevronLeft className="h-3 w-3" />
            Fleet
          </button>
          <div className="mx-1.5 h-4 w-px shrink-0 bg-border-subtle" />
          {activeProjects.map((project) => {
            const display = getProjectDisplayState(project, zellijTabs, nowS, false, runtimeStateKnown);
            const dotClass = display.isRunning
              ? "text-accent-text animate-pulse"
              : display.isReady || display.isOrchestrationReady || display.isClosed
              ? "text-status-positive"
              : display.isSessionOpen
              ? "text-text-secondary"
              : "text-border-default";
            const isFocused = project.tab === focusedTab;
            return (
              <button
                key={project.tab}
                onClick={() => setFocusedTab(project.tab)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  isFocused
                    ? "border-accent-primary/30 bg-accent-muted text-accent-text"
                    : "border-transparent text-text-secondary hover:border-border-subtle hover:text-text-primary",
                )}
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-current", dotClass)} />
                {project.tab}
              </button>
            );
          })}
        </div>
      )}

      {visibleActive.map((project) => (
        <ProjectCard
          key={project.tab}
          {...cardProps(project)}
          onCollapse={expandedTabs.has(project.tab) ? () => collapseTab(project.tab) : undefined}
          onFocus={focusedTab === project.tab ? undefined : () => setFocusedTab(project.tab)}
          isOnlyReady={soloReadyTab === project.tab}
        />
      ))}

      {!focusedTab && idleProjects.length > 0 && (
        <div className="ui-control-idle-section">
          <button
            onClick={() => setIdleOpen((v) => !v)}
            className="flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <span className="font-medium text-text-secondary">Idle projects</span>
            <span className="text-text-muted">({idleProjects.length})</span>
            {idleOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {idleOpen && (
            <div className="space-y-4">
              {idleNeedsAttention.length > 0 && (
                <div className="space-y-2">
                  <div className="sticky top-0 z-10 -mx-1 bg-surface-page/95 px-1 py-1 backdrop-blur-sm">
                    <p className="ui-kicker text-status-warning">
                      Needs attention · {idleNeedsAttention.length}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {idleNeedsAttention.map((project) => (
                      <ProjectTile
                        key={project.tab}
                        project={project}
                        currentAdapter={selectedAgent}
                        zellijTabs={zellijTabs}
                        onExpand={() => expandTab(project.tab)}
                        onLaunch={() => openLaunchModal(project)}
                        onFocus={() => { expandTab(project.tab); setFocusedTab(project.tab); }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {idleQuiet.length > 0 && (
                <div className="space-y-2">
                  {(idleNeedsAttention.length > 0 || idleStale.length > 0) && (
                    <div className="sticky top-0 z-10 -mx-1 bg-surface-page/95 px-1 py-1 backdrop-blur-sm">
                      <p className="ui-kicker text-text-tertiary">
                        Quiet · {idleQuiet.length}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {idleQuiet.map((project) => (
                      <ProjectTile
                        key={project.tab}
                        project={project}
                        currentAdapter={selectedAgent}
                        zellijTabs={zellijTabs}
                        onExpand={() => expandTab(project.tab)}
                        onLaunch={() => openLaunchModal(project)}
                        onFocus={() => { expandTab(project.tab); setFocusedTab(project.tab); }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {idleStale.length > 0 && (
                <div className="space-y-2">
                  <div className="sticky top-0 z-10 -mx-1 bg-surface-page/95 px-1 py-1 backdrop-blur-sm">
                    <p className="ui-kicker text-text-muted">
                      Stale · {idleStale.length}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {idleStale.map((project) => (
                      <ProjectTile
                        key={project.tab}
                        project={project}
                        currentAdapter={selectedAgent}
                        zellijTabs={zellijTabs}
                        onExpand={() => expandTab(project.tab)}
                        onLaunch={() => openLaunchModal(project)}
                        onFocus={() => { expandTab(project.tab); setFocusedTab(project.tab); }}
                        onRemoved={onProjectRemoved}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {visibleIdleInFocus.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {visibleIdleInFocus.map((project) => (
            <ProjectTile
              key={project.tab}
              project={project}
              currentAdapter={selectedAgent}
              zellijTabs={zellijTabs}
              onExpand={() => expandTab(project.tab)}
              onLaunch={() => openLaunchModal(project)}
              onFocus={() => { expandTab(project.tab); setFocusedTab(project.tab); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
