"use client";

import { useState } from "react";
import { Plus, RefreshCw, ChevronUp, ChevronDown, Activity, FolderKanban, Sparkles, PanelsTopLeft, Focus, X, GitCommitHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson, patchJson, throwApiError } from "@/lib/api/fetch";
import { timeAgo } from "@/lib/dates";
import type { ProjectState } from "@/lib/control-types";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { useControlData } from "@/hooks/use-control-data";
import { ProjectCard } from "./ProjectCard";
import { ProjectTile } from "./ProjectTile";
import { buildControlPageState, getProjectDisplayState } from "./control-presenter";
import {
  ActivityLogPanel,
  BrainConfigPanel,
  LaunchTabModal,
  NewProjectModal,
} from "./control-panel-helpers";
import { BootstrapModal } from "./BootstrapModal";

export function ControlPanel() {
  const {
    data, lastUpdated, refreshing, error, setError,
    selectedAgent, model,
    switchableRegistry, selectedDefinition,
    hasPendingChange, savingAgent, lastTabResults, lastTabResultsAt,
    refresh, inject, launchProject, runWithBrain, runCustomPrompt,
    saveAgent, handleAgentSelect, handleModelChange,
  } = useControlData();

  const [activityOpen, setActivityOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(true);
  const [expandedTabs, setExpandedTabs] = useState<Set<string>>(new Set());
  const [focusedTab, setFocusedTab] = useState<string | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDir, setNewDir] = useState("");
  const [newGitUrl, setNewGitUrl] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState("");
  const [launchingProject, setLaunchingProject] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [launchTarget, setLaunchTarget] = useState<{ id: string | null; tab: string; dir: string } | null>(null);
  const launchableAgents = (data?.agentRegistry.agents ?? []).filter((entry) => entry.capabilities.tabSwitching);
  const [launchAgentId, setLaunchAgentId] = useState("");
  const [launchModel, setLaunchModel] = useState("");

  const openLaunchModal = (project: ProjectState, preferredAgentId?: string) => {
    const savedAgentId = project.agentPref ?? preferredAgentId;
    const preferred = launchableAgents.find((entry) => entry.id === savedAgentId)
      ?? launchableAgents.find((entry) => entry.id === selectedAgent)
      ?? launchableAgents[0]
      ?? null;
    if (!preferred) {
      setError("No launchable agents are configured.");
      return;
    }
    setLaunchTarget({ id: project.id, tab: project.tab, dir: project.dir });
    setLaunchAgentId(preferred.id);
    setLaunchModel(project.modelPref ?? preferred.defaultModel);
    setLaunchError("");
  };

  const confirmLaunch = async () => {
    if (!launchTarget) return;
    setLaunchingProject(true);
    setLaunchError("");
    try {
      await launchProject(launchTarget.tab, launchTarget.dir, launchAgentId, launchModel.trim() || undefined);
      // Persist the chosen agent + model so next launch pre-fills them
      if (launchTarget.id) {
        patchJson(`/api/user-projects/${launchTarget.id}`, { agentPref: launchAgentId, modelPref: launchModel.trim() || undefined }).catch(() => {});
      }
      setLaunchTarget(null);
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "Failed to launch project");
    } finally {
      setLaunchingProject(false);
    }
  };

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
      if (!res.ok) await throwApiError(res, "Failed to create project");
      const newProject = await res.json().catch(() => null);
      setNewProjectOpen(false);
      if (newDir.trim()) {
        openLaunchModal({ id: newProject?.id ?? null, projectId: newProject?.entityProjectId ?? null, tab: newName.trim(), dir: newDir.trim(), agentPref: null, modelPref: null } as ProjectState);
      }
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
  const pageState = data ? buildControlPageState(data, expandedTabs, nowS) : null;
  const sorted = pageState?.sortedProjects ?? null;
  const activeProjects = pageState?.activeProjects ?? [];
  const idleProjects = pageState?.idleProjects ?? [];
  const dashboard = pageState?.dashboard ?? null;

  // Keyboard shortcuts (1–9) activate only when exactly one project is ready.
  const readyTabs = data
    ? activeProjects.filter((p) => {
        const s = getProjectDisplayState(p, data.zellijTabs, nowS);
        return s.isReady || s.isOrchestrationReady;
      }).map((p) => p.tab)
    : [];
  const soloReadyTab = readyTabs.length === 1 ? readyTabs[0] : null;

  const headerRight = (
    <div className="flex items-center gap-2.5 text-sm text-text-tertiary">
      {data ? (
        <>
          {dashboard && dashboard.runningCount > 0 && <span className="font-medium text-accent-text tabular-nums">● {dashboard.runningCount}</span>}
          {dashboard && dashboard.waitingCount > 0 && <span className="text-status-positive tabular-nums">{dashboard.waitingCount} waiting</span>}
          {lastUpdated && <span className="hidden sm:inline">{timeAgo(lastUpdated)}</span>}
        </>
      ) : (
        <span>Loading…</span>
      )}
      <button
        onClick={() => refresh(true)}
        disabled={refreshing}
        title="Refresh"
        className="rounded p-0.5 transition-colors hover:text-text-primary disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
      </button>
      <button
        onClick={() => setBootstrapOpen(true)}
        title="Bootstrap new project"
        className="flex items-center gap-1 transition-colors hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  );

  const cardProps = (project: ProjectState) => ({
    project,
    prompts: data!.prompts,
    zellijTabs: data!.zellijTabs,
    currentAdapter: selectedAgent,
    availableAgents: switchableRegistry.map(({ id, label }) => ({ id, label })),
    onInject: async (tab: string, promptKey?: string, customPrompt?: string) => {
      try { await inject(tab, promptKey, customPrompt); }
      catch (err) { setError(err instanceof Error ? err.message : "Injection failed"); }
    },
    onRunWithBrain: async (projectState: ProjectState, intent: OrchestrationTaskIntentId) => {
      try { await runWithBrain(projectState, intent); }
      catch (err) { setError(err instanceof Error ? err.message : "Failed to run task"); }
    },
    onRunCustomPrompt: async (projectState: ProjectState, prompt: string, ag: string) => {
      try { await runCustomPrompt(projectState, prompt, ag); }
      catch (err) { setError(err instanceof Error ? err.message : "Failed to run prompt"); }
    },
  });

  const collapseTab = (tab: string) =>
    setExpandedTabs((tabs) => {
      const next = new Set(tabs);
      next.delete(tab);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:items-start xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]">
        <section className="ui-control-hero xl:sticky xl:top-6">
          <BrainConfigPanel
            selectedAgent={selectedAgent}
            switchableRegistry={switchableRegistry}
            model={model}
            hasPendingChange={hasPendingChange}
            savingAgent={savingAgent}
            selectedDefinition={selectedDefinition}
            lastTabResults={lastTabResults}
            lastTabResultsAt={lastTabResultsAt}
            onAgentSelect={handleAgentSelect}
            onModelChange={handleModelChange}
            onSave={saveAgent}
            headerRight={headerRight}
          />
        </section>

        <section className="ui-control-sidepanel">
          {dashboard && (
            <>
              <div className="space-y-2">
                <p className="ui-kicker">Control inventory</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="ui-control-metric-card">
                    <div className="ui-control-metric-label">
                      <FolderKanban className="h-3.5 w-3.5" />
                      Projects in control
                    </div>
                    <div className="ui-control-metric-value">{dashboard.controlProjectCount}</div>
                    <p className="ui-control-metric-note">
                      {dashboard.idleCount} idle
                    </p>
                  </div>
                  <div className="ui-control-metric-card">
                    <div className="ui-control-metric-label">
                      <Activity className="h-3.5 w-3.5" />
                      Running now
                    </div>
                    <div className="ui-control-metric-value">{dashboard.runningCount}</div>
                    <p className="ui-control-metric-note">Live agent execution</p>
                  </div>
                  <div className="ui-control-metric-card">
                    <div className="ui-control-metric-label">
                      <Sparkles className="h-3.5 w-3.5" />
                      Needs input
                    </div>
                    <div className="ui-control-metric-value">{dashboard.waitingCount}</div>
                    <p className="ui-control-metric-note">Ready for the next prompt</p>
                  </div>
                  <div className="ui-control-metric-card">
                    <div className="ui-control-metric-label">
                      <PanelsTopLeft className="h-3.5 w-3.5" />
                      Open tabs
                    </div>
                    <div className="ui-control-metric-value">{dashboard.openTabCount}</div>
                    <p className="ui-control-metric-note">
                      {dashboard.expandedCount > 0
                        ? `${dashboard.expandedCount} manually expanded`
                        : "Zellij-backed project tabs"}
                    </p>
                  </div>
                </div>
                {dashboard.commitsToday > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-text-tertiary">
                    <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-status-positive/70" />
                    <span><span className="font-medium text-status-positive">{dashboard.commitsToday}</span> commits today across the fleet</span>
                  </div>
                )}
              </div>

              {data && data.recentActivity.length > 0 && (
                <ActivityLogPanel
                  activities={data.recentActivity}
                  open={activityOpen}
                  onToggle={() => setActivityOpen((v) => !v)}
                />
              )}
            </>
          )}
        </section>
      </div>

      {bootstrapOpen && (
        <BootstrapModal
          agentId={selectedAgent}
          agentModel={model}
          onClose={async () => {
            setBootstrapOpen(false);
            await refresh(true);
          }}
        />
      )}

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

      {launchTarget && (
        <LaunchTabModal
          tab={launchTarget.tab}
          dir={launchTarget.dir}
          agents={launchableAgents}
          selectedAgentId={launchAgentId}
          selectedModel={launchModel}
          launching={launchingProject}
          error={launchError}
          onAgentChange={(agentId) => {
            const agent = launchableAgents.find((entry) => entry.id === agentId);
            setLaunchAgentId(agentId);
            setLaunchModel(agent?.defaultModel ?? "");
          }}
          onModelChange={setLaunchModel}
          onLaunch={confirmLaunch}
          onClose={() => setLaunchTarget(null)}
        />
      )}

      {error && <p className="ui-box-error">{error}</p>}

      {sorted ? (
        sorted.length > 0 ? (
          <div className="space-y-4">
            {focusedTab && (
              <div className="flex items-center gap-2 rounded-xl border border-accent-primary/20 bg-accent-muted px-4 py-2.5 text-sm">
                <Focus className="h-3.5 w-3.5 shrink-0 text-accent-text" />
                <span className="font-medium text-accent-text">{focusedTab}</span>
                <span className="text-text-tertiary">— focus mode</span>
                <button
                  onClick={() => setFocusedTab(null)}
                  className="ml-auto flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
                >
                  <X className="h-3 w-3" />
                  Exit focus
                </button>
              </div>
            )}

            {(focusedTab ? activeProjects.filter((p) => p.tab === focusedTab) : activeProjects).map((project) => (
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
                        zellijTabs={data!.zellijTabs}
                        onExpand={() => setExpandedTabs((tabs) => new Set([...tabs, project.tab]))}
                        onLaunch={() => openLaunchModal(project)}
                        onFocus={() => { setExpandedTabs((tabs) => new Set([...tabs, project.tab])); setFocusedTab(project.tab); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {focusedTab && idleProjects.some((p) => p.tab === focusedTab) && (
              <div className="grid grid-cols-1 gap-3">
                {idleProjects.filter((p) => p.tab === focusedTab).map((project) => (
                  <ProjectTile
                    key={project.tab}
                    project={project}
                    currentAdapter={selectedAgent}
                    zellijTabs={data!.zellijTabs}
                    onExpand={() => setExpandedTabs((tabs) => new Set([...tabs, project.tab]))}
                    onLaunch={() => openLaunchModal(project)}
                    onFocus={() => { setExpandedTabs((tabs) => new Set([...tabs, project.tab])); setFocusedTab(project.tab); }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="ui-empty-panel py-8 text-sm">
            No projects configured for the control panel
          </p>
        )
      ) : (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ui-card-shell h-40 animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
