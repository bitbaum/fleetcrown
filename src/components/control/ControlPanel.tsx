"use client";

import { useState, useEffect } from "react";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { RefreshCw, Sparkles, Plus, Moon, LayoutList, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import type { ProjectState } from "@/lib/control-types";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { useControlData } from "@/hooks/use-control-data";
import { useLaunchModal } from "@/hooks/use-launch-modal";
import { useCreateProject } from "@/hooks/use-create-project";
import { useSleepMode } from "@/hooks/use-sleep-mode";
import { buildControlPageState, getProjectDisplayState, buildLiveTabRows } from "./control-presenter";
import { AttentionBar } from "./AttentionBar";
import { DaemonStatusBanner } from "./DaemonStatusBanner";
import {
  ActivityLogPanel,
  BrainConfigPanel,
} from "./control-panel-helpers";
import { ZellijLivePanel } from "./ZellijLivePanel";
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

  const { enabled: sleepMode, toggle: toggleSleepMode } = useSleepMode();
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useLocalStorageState<"full" | "commander">(
    "control:view-mode",
    "full",
    (v) => v,
    (raw) => raw === "commander" ? "commander" : "full",
  );

  // First mobile visit: default to commander (live tabs + fleet) instead of full metrics wall.
  useEffect(() => {
    try {
      if (localStorage.getItem("control:view-mode") !== null) return;
      if (window.matchMedia("(max-width: 767px)").matches) {
        setViewMode("commander");
      }
    } catch { /* ignore */ }
  }, [setViewMode]);
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
  const daemonAgoMs = lastUpdated && daemonLastPushedAt ? lastUpdated - new Date(daemonLastPushedAt).getTime() : null;
  const daemonOffline = !runtimeAvailable && daemonAgoMs !== null && daemonAgoMs > 90_000;
  const daemonNeverSeen = !runtimeAvailable && daemonLastPushedAt === null;
  // Cloud cards cannot truthfully show live agent state without current daemon
  // heartbeats. Queued commands remain visible as requests, not running work.
  const daemonStateUnknown = daemonOffline || daemonNeverSeen;
  const pageState = data ? buildControlPageState(data, expandedTabs, nowS, !daemonStateUnknown) : null;
  const sorted = pageState?.sortedProjects ?? null;
  const activeProjects = pageState?.activeProjects ?? [];
  const idleProjects = pageState?.idleProjects ?? [];
  const idleNeedsAttention = pageState?.idleNeedsAttention ?? [];
  const idleQuiet = pageState?.idleQuiet ?? [];
  const idleStale = pageState?.idleStale ?? [];
  const dashboard = pageState?.dashboard ?? null;
  const attention = pageState?.attention ?? [];
  const liveTabRows = data ? buildLiveTabRows(data.zellijTabs, data.projects, nowS) : [];

  const readyTabs = data
    ? activeProjects.filter((p) => {
        const s = getProjectDisplayState(p, data.zellijTabs, nowS, false, !daemonStateUnknown);
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
      } catch (err) {
        // Set the global error (renders at the top of the page) AND re-throw
        // so the per-card sendError state in useProjectCardActions can render
        // an inline error near the send button. The global banner is invisible
        // when a mobile user is scrolled down to a project card — the inline
        // error is the surface they're guaranteed to see.
        setError(err instanceof Error ? err.message : "Injection failed");
        throw err;
      }
    },
    onRunWithBrain: async (projectState: ProjectState, intent: OrchestrationTaskIntentId) => {
      try { await runWithBrain(projectState, intent); }
      catch (err) {
        setError(err instanceof Error ? err.message : "Failed to run task");
        throw err;
      }
    },
    onRunCustomPrompt: async (projectState: ProjectState, prompt: string, ag: string) => {
      try { await runCustomPrompt(projectState, prompt, ag); }
      catch (err) {
        setError(err instanceof Error ? err.message : "Failed to run prompt");
        throw err;
      }
    },
    onDeleted: () => { refresh(true); },
    onProfileSaved: () => { refresh(true); },
    runtimeAvailable,
    runtimeStateKnown: !daemonStateUnknown,
  });

  // When daemon is offline or never connected we don't know which projects are actually
  // running — don't label them all "idle". Collapse the idle section and show everything
  // in the main list so nothing falsely appears inactive.
  const fleetActive = daemonStateUnknown ? (sorted ?? []) : activeProjects;
  const fleetIdle   = daemonStateUnknown ? [] : idleProjects;
  const fleetIdleNeedsAttention = daemonStateUnknown ? [] : idleNeedsAttention;
  const fleetIdleQuiet = daemonStateUnknown ? [] : idleQuiet;
  const fleetIdleStale = daemonStateUnknown ? [] : idleStale;

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
        <div className="h-3 w-16 animate-pulse rounded bg-border-default" />
      )}
      <button
        onClick={toggleSleepMode}
        title={sleepMode ? "Sleep mode on — countdown is 0; any keypress wakes" : "Sleep mode — auto-fire every ready banner with no countdown"}
        className={cn("ui-icon-btn-touch rounded p-0.5 transition-colors hover:text-text-primary", sleepMode && "text-accent-text")}
      >
        <Moon className={cn("h-3.5 w-3.5", sleepMode && "fill-current")} />
      </button>
      <button
        onClick={() => setViewMode((v) => v === "full" ? "commander" : "full")}
        title={viewMode === "full" ? "Switch to commander view" : "Switch to full view"}
        className={cn("ui-icon-btn-touch rounded p-0.5 transition-colors hover:text-text-primary", viewMode === "commander" && "text-accent-text")}
      >
        {viewMode === "full" ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => refresh(true)}
        disabled={refreshing}
        title="Refresh"
        className="ui-icon-btn-touch rounded p-0.5 transition-colors hover:text-text-primary disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
      </button>
      {/* On cloud (runtimeAvailable=false) Bootstrap-with-AI 503s because
          /api/project/ai-brief requires the local claude CLI — same gap the
          /control empty state already gates on (commit 3b2fbad). Route the
          toolbar "+ New" button to NewProjectModal (Register existing
          project) instead so the affordance stays useful in cloud mode
          instead of leading to the same dead-end. On local it still opens
          Bootstrap as before. */}
      <button
        onClick={() => runtimeAvailable ? setBootstrapOpen(true) : setNewProjectOpen(true)}
        title={runtimeAvailable ? "Bootstrap new project" : "Register existing project"}
        className="inline-flex min-h-11 lg:min-h-0 items-center gap-1 transition-colors hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <DaemonStatusBanner
        daemonNeverSeen={daemonNeverSeen}
        daemonOffline={daemonOffline}
        daemonLastPushedAt={daemonLastPushedAt}
      />

      {!focusedTab && (
        <>
          <ZellijLivePanel
            rows={liveTabRows}
            daemonStateUnknown={daemonStateUnknown}
            dashboard={dashboard}
            refreshing={refreshing}
            onRefresh={() => refresh(true)}
            onFocusProject={setFocusedTab}
          />

          <details className="ui-control-launch-defaults">
            <summary className="ui-control-launch-defaults-summary">
              Launch defaults — default agent &amp; model for new tabs
            </summary>
            <div className="ui-control-launch-defaults-body">
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
            </div>
          </details>

          {data && data.recentActivity.length > 0 && (
            <ActivityLogPanel
              activities={data.recentActivity}
              open={activityOpen}
              onToggle={() => setActivityOpen((v) => !v)}
            />
          )}
        </>
      )}

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


      {error && <p className="ui-box-error">{error}</p>}
      {queuedNotice && (
        <div className="ui-control-notice">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {queuedNotice}
        </div>
      )}

      <AttentionBar items={attention} failedCommands={data?.failedCommands} onFocusProject={setFocusedTab} />

      <ProjectFleetView
        viewMode={viewMode}
        sorted={sorted}
        activeProjects={fleetActive}
        idleProjects={fleetIdle}
        idleNeedsAttention={fleetIdleNeedsAttention}
        idleQuiet={fleetIdleQuiet}
        idleStale={fleetIdleStale}
        onProjectRemoved={() => refresh(true)}
        focusedTab={focusedTab}
        setFocusedTab={setFocusedTab}
        expandedTabs={expandedTabs}
        setExpandedTabs={setExpandedTabs}
        idleOpen={idleOpen}
        setIdleOpen={setIdleOpen}
        zellijTabs={data?.zellijTabs ?? []}
        nowS={nowS}
        selectedAgent={selectedAgent}
        soloReadyTab={soloReadyTab}
        openLaunchModal={openLaunchModal}
        cardProps={cardProps}
        onBootstrap={() => setBootstrapOpen(true)}
        onNewProject={() => setNewProjectOpen(true)}
        runtimeAvailable={runtimeAvailable}
        runtimeStateKnown={!daemonStateUnknown}
      />
    </div>
  );
}
