"use client";

import { ChevronUp, ChevronDown, ChevronLeft, Plus, Sparkles } from "lucide-react";
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
}

export function ProjectFleetView({
  viewMode,
  sorted,
  activeProjects,
  idleProjects,
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
        <span className="text-4xl text-text-muted">⊞</span>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Add your first project</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
            The control panel is your fleet view — register a project to track its agent sessions, git state, and next actions from one place.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={onBootstrap} className="ui-btn-primary gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Bootstrap new project →
          </button>
          <button onClick={onNewProject} className="ui-btn-secondary gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Register existing project
          </button>
        </div>
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
            const display = getProjectDisplayState(project, zellijTabs, nowS);
            const dotClass = display.isRunning
              ? "text-accent-text animate-pulse"
              : display.isReady || display.isOrchestrationReady || display.isClosed
              ? "text-status-positive"
              : project.agentRunning
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {idleProjects.map((project) => (
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
