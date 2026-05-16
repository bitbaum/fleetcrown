"use client";

import { useState } from "react";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { RefreshCw, FolderKanban, Sparkles, PanelsTopLeft, Activity, GitCommitHorizontal, LayoutList, LayoutGrid, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import type { ProjectState } from "@/lib/control-types";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { useControlData } from "@/hooks/use-control-data";
import { useLaunchModal } from "@/hooks/use-launch-modal";
import { useCreateProject } from "@/hooks/use-create-project";
import { buildControlPageState, getProjectDisplayState } from "./control-presenter";
import { AttentionBar } from "./AttentionBar";
import { DaemonStatusBanner } from "./DaemonStatusBanner";
import {
  ActivityLogPanel,
  BrainConfigPanel,
  ControlMetricCard,
} from "./control-panel-helpers";
import { LaunchTabModal, NewProjectModal } from "./control-panel-modals";
import { BootstrapModal } from "./BootstrapModal";
import { ProjectFleetView } from "./ProjectFleetView";

export function ControlPanel() {
  const {
    data, lastUpdated, refreshing, error, setError,
    selectedAgent, model,
    switchableRegistry, selectedDefinition,
    hasPendingChange, savingAgent, lastTabResults, lastTabResultsAt,
    runtimeAvailable, daemonLastPushedAt,
    refresh, inject, launchProject, runWithBrain, runCustomPrompt,
    saveAgent, handleAgentSelect, handleModelChange,
  } = useControlData();

  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useLocalStorageState<"full" | "commander">(
    "control:view-mode",
    "full",
    (v) => v,
    (raw) => raw === "commander" ? "commander" : "full",
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(true);
  const [expandedTabs, setExpandedTabs] = useState<Set<string>>(new Set());
  const [focusedTab, setFocusedTab] = useState<string | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  // eslint-disable-next-line react-hooks/purity
  const nowS = Math.floor(Date.now() / 1000);

  const launchableAgents = (data?.agentRegistry.agents ?? []).filter((entry) => entry.capabilities.tabSwitching);

  const {
    launchTarget, launchAgentId, launchModel, launchInitialPrompt, launchingProject, launchError,
    setLaunchTarget, setLaunchAgentId, setLaunchModel, setLaunchInitialPrompt,
    openLaunchModal, confirmLaunch,
  } = useLaunchModal({ launchableAgents, selectedAgent, setError, launchProject });

  const {
    newProjectOpen, setNewProjectOpen,
    newName, setNewName, newDir, setNewDir, newGitUrl, setNewGitUrl,
    creatingProject, createError, createAndLaunch,
  } = useCreateProject({ openLaunchModal, refresh });
  const pageState = data ? buildControlPageState(data, expandedTabs, nowS) : null;
  const sorted = pageState?.sortedProjects ?? null;
  const activeProjects = pageState?.activeProjects ?? [];
  const idleProjects = pageState?.idleProjects ?? [];
  const dashboard = pageState?.dashboard ?? null;
  const attention = pageState?.attention ?? [];

  const readyTabs = data
    ? activeProjects.filter((p) => {
        const s = getProjectDisplayState(p, data.zellijTabs, nowS);
        return s.isReady || s.isOrchestrationReady;
      }).map((p) => p.tab)
    : [];
  const soloReadyTab = readyTabs.length === 1 ? readyTabs[0] : null;

  const cardProps = (project: ProjectState) => ({
    project,
    prompts: data!.prompts,
    zellijTabs: data!.zellijTabs,
    currentAdapter: selectedAgent,
    availableAgents: switchableRegistry.map(({ id, label, modelSuggestions }) => ({ id, label, modelSuggestions })),
    onInject: async (tab: string, promptKey?: string, customPrompt?: string) => {
      try {
        const { mode } = await inject(tab, promptKey, customPrompt);
        if (mode === "queued") {
          setQueuedNotice(`Command queued — local daemon will execute it for ${tab}`);
          setTimeout(() => setQueuedNotice(null), 6000);
        }
      } catch (err) { setError(err instanceof Error ? err.message : "Injection failed"); }
    },
    onRunWithBrain: async (projectState: ProjectState, intent: OrchestrationTaskIntentId) => {
      try { await runWithBrain(projectState, intent); }
      catch (err) { setError(err instanceof Error ? err.message : "Failed to run task"); }
    },
    onRunCustomPrompt: async (projectState: ProjectState, prompt: string, ag: string) => {
      try { await runCustomPrompt(projectState, prompt, ag); }
      catch (err) { setError(err instanceof Error ? err.message : "Failed to run prompt"); }
    },
    onDeleted: () => { refresh(true); },
    onProfileSaved: () => { refresh(true); },
    runtimeAvailable,
  });

  const daemonAgoMs = lastUpdated && daemonLastPushedAt ? lastUpdated - new Date(daemonLastPushedAt).getTime() : null;
  const daemonOffline = !runtimeAvailable && daemonAgoMs !== null && daemonAgoMs > 90_000;
  const daemonNeverSeen = !runtimeAvailable && daemonLastPushedAt === null;

  const headerRight = (
    <div className="flex items-center gap-2.5 text-sm text-text-tertiary">
      {data ? (
        <>
          {dashboard && dashboard.runningCount > 0 && <span className="font-medium text-accent-text tabular-nums">● {dashboard.runningCount}</span>}
          {dashboard && dashboard.waitingCount > 0 && <span className="text-status-positive tabular-nums">{dashboard.waitingCount} waiting</span>}
          {(daemonNeverSeen || daemonOffline) && (
            <span className="hidden sm:inline h-1.5 w-1.5 rounded-full bg-status-warning" title="Daemon offline — see banner below" />
          )}
          {!daemonNeverSeen && !daemonOffline && daemonLastPushedAt && (
            <span className="hidden sm:inline text-text-muted" title="Local daemon last sync">daemon {timeAgo(new Date(daemonLastPushedAt).getTime())}</span>
          )}
          {lastUpdated && <span className="hidden sm:inline">{timeAgo(lastUpdated)}</span>}
        </>
      ) : (
        <span>Loading…</span>
      )}
      <button
        onClick={() => setViewMode((v) => v === "full" ? "commander" : "full")}
        title={viewMode === "full" ? "Switch to commander view" : "Switch to full view"}
        className={cn("ui-icon-btn rounded p-0.5 transition-colors hover:text-text-primary", viewMode === "commander" && "text-accent-text")}
      >
        {viewMode === "full" ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => refresh(true)}
        disabled={refreshing}
        title="Refresh"
        className="ui-icon-btn rounded p-0.5 transition-colors hover:text-text-primary disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
      </button>
      <button
        onClick={() => setBootstrapOpen(true)}
        title="Bootstrap new project"
        className="inline-flex min-h-11 sm:min-h-0 items-center gap-1 transition-colors hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  );

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
                  <ControlMetricCard icon={FolderKanban} label="Projects in control" value={dashboard.controlProjectCount} note={`${dashboard.idleCount} idle`} />
                  <ControlMetricCard icon={Activity} label="Running now" value={dashboard.runningCount} note="Live agent execution" />
                  <ControlMetricCard icon={Sparkles} label="Needs input" value={dashboard.waitingCount} note="Ready for the next prompt" />
                  <ControlMetricCard icon={PanelsTopLeft} label="Open tabs" value={dashboard.openTabCount} note="Zellij-backed project tabs" />
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
          onClose={async () => { setBootstrapOpen(false); await refresh(true); }}
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
          initialPrompt={launchInitialPrompt}
          launching={launchingProject}
          error={launchError}
          onAgentChange={(agentId) => {
            const agent = launchableAgents.find((entry) => entry.id === agentId);
            setLaunchAgentId(agentId);
            setLaunchModel(agent?.defaultModel ?? "");
          }}
          onModelChange={setLaunchModel}
          onInitialPromptChange={setLaunchInitialPrompt}
          onLaunch={confirmLaunch}
          onClose={() => setLaunchTarget(null)}
        />
      )}

      <DaemonStatusBanner
        daemonNeverSeen={daemonNeverSeen}
        daemonOffline={daemonOffline}
        daemonLastPushedAt={daemonLastPushedAt}
      />

      {error && <p className="ui-box-error">{error}</p>}
      {queuedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-accent-primary/20 bg-accent-muted px-4 py-2.5 text-sm text-accent-text">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {queuedNotice}
        </div>
      )}

      <AttentionBar items={attention} />

      <ProjectFleetView
        viewMode={viewMode}
        sorted={sorted}
        activeProjects={activeProjects}
        idleProjects={idleProjects}
        focusedTab={focusedTab}
        setFocusedTab={setFocusedTab}
        expandedTabs={expandedTabs}
        setExpandedTabs={setExpandedTabs}
        idleOpen={idleOpen}
        setIdleOpen={setIdleOpen}
        zellijTabs={data?.zellijTabs ?? []}
        selectedAgent={selectedAgent}
        soloReadyTab={soloReadyTab}
        openLaunchModal={openLaunchModal}
        cardProps={cardProps}
        onBootstrap={() => setBootstrapOpen(true)}
        onNewProject={() => setNewProjectOpen(true)}
      />
    </div>
  );
}
