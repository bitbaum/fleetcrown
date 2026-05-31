"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Plus, Settings2 } from "lucide-react";
import { timeAgo } from "@/lib/dates";
import { postJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { useControlData } from "@/hooks/use-control-data";
import { useLaunchModal } from "@/hooks/use-launch-modal";
import { useCreateProject } from "@/hooks/use-create-project";
import { buildControlPageState, buildProjectOperationsSnapshots, buildLiveTabRows } from "./control-presenter";
import { ControlFleetStatus } from "./ControlFleetStatus";
import { AttentionBar } from "./AttentionBar";
import { DaemonStatusBanner } from "./DaemonStatusBanner";
import {
  ActivityLogPanel,
  BrainConfigPanel,
} from "./control-panel-helpers";
import { ZellijLivePanel } from "./ZellijLivePanel";
import { LaunchTabModal, NewProjectModal } from "./control-panel-modals";
import { BootstrapModal } from "./BootstrapModal";
import { ProjectOperationsView } from "./ProjectOperationsView";
import { useAutomationPolicy } from "@/hooks/use-automation-policy";

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
  const automationPolicy = useAutomationPolicy();
  const [activityOpen, setActivityOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [highlightTab, setHighlightTab] = useState<string | null>(null);
  const [liveTargetTab, setLiveTargetTab] = useState<string | null>(null);
  const livePanelRef = useRef<HTMLElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const focusParam = searchParams.get("focus")?.trim() ?? null;
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const liveDetailsRef = useRef<HTMLDetailsElement>(null);
  // eslint-disable-next-line react-hooks/purity
  const nowS = Math.floor(Date.now() / 1000);

  // Trigger the hosted one-click installer flow for a specific agent CLI.
  // Re-uses the same primitive as the DaemonStatusBanner "Install X" buttons.
  // Shows the existing queuedNotice toast so the user sees immediate feedback.
  const requestAgentInstall = async (agentId: string) => {
    const label = switchableRegistry.find((e) => e.id === agentId)?.label ?? agentId;
    setQueuedNotice(`Opening install tab for ${label}...`);
    setTimeout(() => setQueuedNotice(null), 6000);
    try {
      await fetch("/api/agent/install-cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agentId }),
      });
    } catch {
      // Best effort — the daemon (if running) will still open the tab via the command queue.
    }
  };

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
  // Only hide cached runtime when the daemon has never connected. When offline
  // but we have a last push, show last-known Working/Ready state with a stale label.
  const daemonStateUnknown = daemonNeverSeen;
  const runtimeStateKnown = !daemonNeverSeen;
  const daemonSyncStale = daemonOffline && daemonLastPushedAt !== null;
  const runtimeSyncCtx = {
    syncStale: daemonSyncStale,
    lastSyncedAt: daemonLastPushedAt,
  };
  const pageState = data ? buildControlPageState(data, nowS, runtimeStateKnown) : null;
  const dashboard = pageState?.dashboard ?? null;
  const attention = pageState?.attention ?? [];
  const liveTabRows = useMemo(
    () => (data ? buildLiveTabRows(data.zellijTabs, data.projects, nowS) : []),
    [data, nowS],
  );
  const snapshots = data
    ? buildProjectOperationsSnapshots(data.projects, data.zellijTabs, nowS, runtimeStateKnown, runtimeSyncCtx)
    : null;

  const failedCount = data?.failedCommands?.length ?? 0;

  useEffect(() => {
    if (!snapshots?.length) return;
    const currentValid = selectedTab && snapshots.some((s) => s.project.tab === selectedTab);
    if (currentValid) return;
    const priority = snapshots.find(
      (s) => s.phase === "waiting_for_user" || s.attentionReason,
    );
    setSelectedTab(priority?.project.tab ?? snapshots[0].project.tab);
  }, [snapshots, selectedTab]);

  // Push notification deep-link: /control?focus=<tab> lands on the live panel
  // and selects the matching workspace (registered project or open tab).
  useEffect(() => {
    if (!focusParam || !data) return;

    const tabLower = focusParam.toLowerCase();
    const snapshotTab = snapshots?.find((s) => s.project.tab.toLowerCase() === tabLower)?.project.tab;
    const liveTab = liveTabRows.find((r) => r.tabName.toLowerCase() === tabLower)?.tabName;
    const resolvedTab = snapshotTab ?? liveTab;
    if (!resolvedTab) return;

    if (snapshotTab) setSelectedTab(snapshotTab);
    setHighlightTab(resolvedTab);
    setLiveTargetTab(resolvedTab);
    if (liveDetailsRef.current) liveDetailsRef.current.open = true;
    livePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    postJson("/api/control/focus-tab", { tab: resolvedTab }).catch(() => { /* best effort */ });

    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [focusParam, data, snapshots, liveTabRows, pathname, router, searchParams]);

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
    onLaunch: () => openLaunchModal(project),
    runtimeAvailable,
    runtimeStateKnown,
    daemonSyncStale,
    automationMode: automationPolicy.mode,
    countdownSeconds: automationPolicy.countdownSeconds,
  });

  const headerRight = (
    <div className="flex items-center gap-2.5 text-sm text-text-tertiary">
      {data ? (
        <>
          {dashboard && dashboard.runningCount > 0 && <span className="font-medium text-accent-text tabular-nums">● {dashboard.runningCount}</span>}
          {dashboard && dashboard.waitingCount > 0 && <span className="text-status-positive tabular-nums">{dashboard.waitingCount} waiting</span>}
          {(daemonNeverSeen || daemonOffline) && (
            <span className="h-1.5 w-1.5 rounded-full bg-status-warning" title="Daemon offline — see banner below" />
          )}
          {!daemonNeverSeen && !daemonOffline && daemonLastPushedAt && (
            <span className="text-text-muted" title="Local daemon last sync">daemon {timeAgo(new Date(daemonLastPushedAt).getTime())}</span>
          )}
          {lastUpdated && <span>{timeAgo(lastUpdated)}</span>}
        </>
      ) : (
        <div className="h-3 w-16 animate-pulse rounded bg-border-default" />
      )}
      <button
        onClick={() => runtimeAvailable ? setBootstrapOpen(true) : setNewProjectOpen(true)}
        title={`New project using ${selectedDefinition?.label ?? selectedAgent} · ${model || selectedDefinition?.defaultModel || ""}`}
        className="inline-flex min-h-11 lg:min-h-0 items-center gap-1 transition-colors hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  );

  const livePanelProps = {
    rows: liveTabRows,
    daemonNeverSeen,
    daemonSyncStale,
    dashboard,
    refreshing,
    onRefresh: () => refresh(true),
    onFocusProject: setSelectedTab,
    highlightTab,
    initialTargetTab: liveTargetTab,
    panelRef: livePanelRef,
  };

  const livePanelDesktop = <ZellijLivePanel {...livePanelProps} />;
  const livePanelMobile = <ZellijLivePanel {...livePanelProps} embedded />;

  return (
    <div className="space-y-6">
      {/* Hierarchy rewrite 2026-05-31: when the daemon is offline or never seen,
          the banner with Start/Restart buttons OWNS the top viewport — it's
          the only actionable thing on the page until the user reconnects.
          When healthy, the banner self-hides and FleetStatus is the first thing
          the eye lands on. Also removed the verbose "Agent operations / Current
          work, queued instructions, and saved context by project" section
          header: that subtitle taught the user nothing they couldn't infer
          from the table itself. */}
      <DaemonStatusBanner
        daemonNeverSeen={daemonNeverSeen}
        daemonOffline={daemonOffline}
        daemonLastPushedAt={daemonLastPushedAt}
        runtimeAvailable={runtimeAvailable}
        onRefresh={() => refresh(true)}
      />

      <ControlFleetStatus
        dashboard={dashboard}
        attentionCount={attention.length}
        failedCount={failedCount}
        daemonNeverSeen={daemonNeverSeen}
        daemonOffline={daemonOffline}
        daemonStateUnknown={daemonNeverSeen}
        daemonLastPushedAt={daemonLastPushedAt}
        lastUpdated={lastUpdated}
        automationMode={automationPolicy.mode}
        automationSaving={automationPolicy.saving}
        refreshing={refreshing}
        onRefresh={() => refresh(true)}
        onAutomationChange={automationPolicy.updateMode}
      />

      {headerRight && (
        <section className="ui-control-operations-header">
          <div />
          {headerRight}
        </section>
      )}

      <AttentionBar items={attention} failedCommands={data?.failedCommands} onFocusProject={setSelectedTab} />

      <ProjectOperationsView
        snapshots={snapshots}
        selectedTab={selectedTab}
        onSelect={setSelectedTab}
        cardProps={cardProps}
        onBootstrap={() => setBootstrapOpen(true)}
        onNewProject={() => setNewProjectOpen(true)}
        runtimeAvailable={runtimeAvailable}
      />

      <details ref={liveDetailsRef} className="ui-control-live-details md:hidden">
        <summary className="ui-control-live-details-summary">
          <span>Terminal workspaces</span>
          <span className="ui-tag ui-tag-neutral text-micro">
            {daemonNeverSeen ? "offline" : daemonSyncStale ? `${liveTabRows.length} open · stale` : `${liveTabRows.length} open`}
          </span>
        </summary>
        <div className="ui-control-live-details-body">{livePanelMobile}</div>
      </details>
      <div className="hidden md:block">{livePanelDesktop}</div>

      <details className="ui-control-launch-defaults">
        <summary className="ui-control-launch-defaults-summary flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5" />
          Diagnostics and launch settings
        </summary>
        <div className="ui-control-launch-defaults-body space-y-5">
          <section>
            <h3 className="mb-3 text-sm font-medium text-text-secondary">Launch defaults</h3>
            <p className="mb-3 text-xs leading-relaxed text-text-tertiary">
              These choices are used when Cockpit opens a new terminal tab. CLI availability is reported by the connected computer, not by Vercel.
            </p>
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
                onRequestInstall={requestAgentInstall}
                onLaunchNew={() => (runtimeAvailable ? setBootstrapOpen(true) : setNewProjectOpen(true))}
              />
          </section>

          {data && data.recentActivity.length > 0 && (
            <ActivityLogPanel
              activities={data.recentActivity}
              open={activityOpen}
              onToggle={() => setActivityOpen((v) => !v)}
            />
          )}
        </div>
      </details>

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

    </div>
  );
}
