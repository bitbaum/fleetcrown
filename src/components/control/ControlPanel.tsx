"use client";

import { useState } from "react";
import { Terminal, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import { READY_WINDOW_S, CLOSED_WINDOW_S, CLOSING_WINDOW_S, withinWindow } from "@/lib/constants/control";
import type { ProjectState } from "@/app/api/control/route";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { useControlData } from "@/hooks/use-control-data";
import { ProjectCard } from "./ProjectCard";
import { ProjectTile } from "./ProjectTile";
import {
  ActivityLogPanel,
  BrainConfigPanel,
  FleetStatusBar,
  NewProjectModal,
} from "./control-panel-helpers";

const ACTIVE_WINDOW_S = 300;

function isActiveProject(p: ProjectState, nowS: number): boolean {
  return (
    p.agentRunning ||
    withinWindow(p.readyAt, nowS, ACTIVE_WINDOW_S) ||
    withinWindow(p.closingAt, nowS, ACTIVE_WINDOW_S) ||
    withinWindow(p.closedAt, nowS, ACTIVE_WINDOW_S) ||
    p.currentPrompt !== null
  );
}

export function ControlPanel() {
  const {
    data, lastUpdated, refreshing, error, setError,
    selectedAgent, model, savedConfig,
    switchableRegistry, activeDefinition, selectedDefinition,
    hasPendingChange, savingAgent, lastTabResults, lastTabResultsAt,
    refresh, inject, launchProject, runWithBrain, runCustomPrompt,
    saveAgent, handleAgentSelect, handleModelChange,
  } = useControlData();

  const [brainOpen, setBrainOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(true);
  const [expandedTabs, setExpandedTabs] = useState<Set<string>>(new Set());
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDir, setNewDir] = useState("");
  const [newGitUrl, setNewGitUrl] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState("");

  const createAndLaunch = async () => {
    if (!newName.trim()) return;
    setCreatingProject(true);
    setCreateError("");
    try {
      const res = await postJson("/api/user-projects", {
        name: newName.trim(),
        dirPath: newDir.trim() || undefined,
        gitUrl: newGitUrl.trim() || undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create project");
      }
      if (newDir.trim()) await launchProject(newName.trim(), newDir.trim());
      setNewProjectOpen(false);
      setNewName("");
      setNewDir("");
      setNewGitUrl("");
      await refresh(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreatingProject(false);
    }
  };

  const nowS = Math.floor(Date.now() / 1000);
  const running = data?.projects.filter((p) => p.agentRunning).length ?? 0;
  const waitingCount = data?.projects.filter(
    (p) =>
      !p.agentRunning &&
      withinWindow(p.readyAt, nowS, READY_WINDOW_S) &&
      !withinWindow(p.closedAt, nowS, CLOSED_WINDOW_S) &&
      !withinWindow(p.closingAt, nowS, CLOSING_WINDOW_S)
  ).length ?? 0;
  const todayCommits = data?.projects.reduce((sum, p) => sum + (p.git?.todayCount ?? 0), 0) ?? 0;
  const total = data?.projects.length ?? 0;

  const sorted = data
    ? [...data.projects].sort((a, b) => {
        const n = Math.floor(Date.now() / 1000);
        const aReady  = !a.agentRunning && withinWindow(a.readyAt, n, READY_WINDOW_S);
        const bReady  = !b.agentRunning && withinWindow(b.readyAt, n, READY_WINDOW_S);
        const aClosed = withinWindow(a.closedAt, n, CLOSED_WINDOW_S);
        const bClosed = withinWindow(b.closedAt, n, CLOSED_WINDOW_S);
        if (aClosed && !bClosed) return -1;
        if (!aClosed && bClosed) return 1;
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;
        if (a.agentRunning && !b.agentRunning) return -1;
        if (!a.agentRunning && b.agentRunning) return 1;
        const aActive = (a.git?.todayCount ?? 0) > 0;
        const bActive = (b.git?.todayCount ?? 0) > 0;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return 0;
      })
    : null;

  return (
    <div className="space-y-5">
      <div className="ui-panel-raised space-y-5 p-5 md:p-7">
        <div className="ui-stat-grid">
          <div className="ui-stat-card">
            <div className="ui-stat-label">Active sessions</div>
            <div className="ui-stat-value">{running}</div>
          </div>
          <div className="ui-stat-card">
            <div className="ui-stat-label">Waiting</div>
            <div className="ui-stat-value">{waitingCount}</div>
          </div>
          <div className="ui-stat-card">
            <div className="ui-stat-label">Commits today</div>
            <div className="ui-stat-value">{todayCommits}</div>
          </div>
        </div>

        {data?.recentActivity && (
          <ActivityLogPanel
            activities={data.recentActivity}
            open={activityOpen}
            onToggle={() => setActivityOpen((v) => !v)}
          />
        )}

        <BrainConfigPanel
          brainOpen={brainOpen}
          onToggle={() => setBrainOpen((v) => !v)}
          selectedAgent={selectedAgent}
          switchableRegistry={switchableRegistry}
          model={model}
          savedConfig={savedConfig}
          hasPendingChange={hasPendingChange}
          savingAgent={savingAgent}
          activeDefinition={activeDefinition}
          selectedDefinition={selectedDefinition}
          lastTabResults={lastTabResults}
          lastTabResultsAt={lastTabResultsAt}
          onAgentSelect={handleAgentSelect}
          onModelChange={handleModelChange}
          onSave={saveAgent}
        />
      </div>

      <FleetStatusBar
        running={running}
        waitingCount={waitingCount}
        todayCommits={todayCommits}
        total={total}
        lastUpdated={lastUpdated}
        selectedAgent={selectedAgent}
        refreshing={refreshing}
        onNewProject={() => setNewProjectOpen(true)}
        onRefresh={() => refresh(true)}
      />

      {newProjectOpen && (
        <NewProjectModal
          name={newName}
          dir={newDir}
          gitUrl={newGitUrl}
          error={createError}
          creating={creatingProject}
          onNameChange={setNewName}
          onDirChange={setNewDir}
          onGitUrlChange={setNewGitUrl}
          onCreate={createAndLaunch}
          onClose={() => setNewProjectOpen(false)}
        />
      )}

      {error && <p className="ui-box-error rounded-2xl px-4 py-3 text-sm">{error}</p>}

      {data && data.zellijTabs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Terminal className="h-4 w-4 text-text-muted shrink-0" />
          {data.zellijTabs.map((t) => {
            const hasProject = data.projects.some((p) => p.tab.toLowerCase() === t.toLowerCase());
            return (
              <span
                key={t}
                className={cn(
                  "rounded-full px-2 py-1 font-mono text-[11px]",
                  hasProject ? "bg-surface-raised text-text-secondary" : "bg-surface-overlay text-text-muted"
                )}
              >
                {t}
              </span>
            );
          })}
        </div>
      )}

      {sorted ? (
        sorted.length > 0 ? (() => {
          const nowS2 = Math.floor(Date.now() / 1000);
          const activeProjects = sorted.filter((p) => isActiveProject(p, nowS2) || expandedTabs.has(p.tab));
          const idleProjects = sorted.filter((p) => !isActiveProject(p, nowS2) && !expandedTabs.has(p.tab));

          const cardProps = (project: ProjectState) => ({
            project,
            prompts: data!.prompts,
            zellijTabs: data!.zellijTabs,
            currentAdapter: data?.agentConfig.agent ?? "claude",
            onInject: inject,
            onRunWithBrain: async (projectState: ProjectState, intent: OrchestrationTaskIntentId) => {
              try { await runWithBrain(projectState, intent); }
              catch (err) { setError(err instanceof Error ? err.message : "Failed to run task"); }
            },
            onRunCustomPrompt: async (projectState: ProjectState, prompt: string, ag: string) => {
              try { await runCustomPrompt(projectState, prompt, ag); }
              catch (err) { setError(err instanceof Error ? err.message : "Failed to run prompt"); }
            },
          });

          return (
            <div className="space-y-3">
              {activeProjects.map((project) => (
                <ProjectCard key={project.tab} {...cardProps(project)} />
              ))}

              {idleProjects.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setIdleOpen((v) => !v)}
                    className="flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    <span>Idle ({idleProjects.length})</span>
                    {idleOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {idleOpen && (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {idleProjects.map((project) => (
                        <ProjectTile
                          key={project.tab}
                          project={project}
                          currentAdapter={selectedAgent}
                          onExpand={() => setExpandedTabs((s) => new Set([...s, project.tab]))}
                          onLaunch={() => launchProject(project.tab, project.dir)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })() : (
          <p className="py-8 text-center text-sm text-text-tertiary">
            No projects configured for the control panel
          </p>
        )
      ) : (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[1.5rem] border border-border-subtle bg-surface-base" />
          ))}
        </div>
      )}
    </div>
  );
}
