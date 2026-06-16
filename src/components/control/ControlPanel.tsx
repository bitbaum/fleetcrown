"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Settings2 } from "lucide-react";
import { RUNNER_OFFLINE_THRESHOLD_MS } from "@/lib/constants/runner";
import { postJson } from "@/lib/api/fetch";
import { useControlData } from "@/hooks/use-control-data";
import { useLaunchModal } from "@/hooks/use-launch-modal";
import { useCreateProject } from "@/hooks/use-create-project";
import { buildControlPageState, buildProjectOperationsSnapshots, buildLiveTabRows } from "./control-presenter";
import { ControlFleetStatus } from "./ControlFleetStatus";
import { AttentionBar } from "./AttentionBar";
import { RunnerStatusBanner } from "./RunnerStatusBanner";
import { APP_NAME } from "@/config/brand";
import {
  ActivityLogPanel,
  BrainConfigPanel,
} from "./control-panel-helpers";
import { ZellijLivePanel } from "./ZellijLivePanel";
import { buildCardProps } from "./control-panel-card-props";
import { LaunchTabModal, NewProjectModal } from "./control-panel-modals";
import { BootstrapModal } from "./BootstrapModal";
import { ProjectOperationsView } from "./ProjectOperationsView";
import { EmptyStateWelcome } from "./EmptyStateWelcome";
import { GitHubRepoSuggestions } from "./GitHubRepoSuggestions";
import { LocalDevSuggestions } from "./LocalDevSuggestions";
import { MissingCLIsBanner } from "@/components/desktop/MissingCLIsBanner";
import { useAutomationPolicy } from "@/hooks/use-automation-policy";

export function ControlPanel() {
  const {
    data, lastUpdated, refreshing, error, setError,
    selectedAgent, model,
    switchableRegistry, selectedDefinition,
    hasPendingChange, savingAgent, lastTabResults, lastTabResultsAt,
    runtimeAvailable, runnerLastPushedAt, runnerConnected,
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
  const switchToParam = searchParams.get("switchTo")?.trim() ?? null;
  const [switchNotice, setSwitchNotice] = useState<string | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const liveDetailsRef = useRef<HTMLDetailsElement>(null);
  // eslint-disable-next-line react-hooks/purity
  const nowS = Math.floor(Date.now() / 1000);

  // Trigger the hosted one-click installer flow for a specific agent CLI.
  // Re-uses the same primitive as the RunnerStatusBanner "Install X" buttons.
  // Shows the existing queuedNotice toast so the user sees immediate feedback.
  const requestAgentInstall = async (agentId: string) => {
    const label = switchableRegistry.find((e) => e.id === agentId)?.label ?? agentId;
    setQueuedNotice(`Opening install tab for ${label}...`);
    setTimeout(() => setQueuedNotice(null), 6000);
    // Best effort — Fleet Runner (if running) opens the tab via the command queue.
    await postJson("/api/agent/install-cli", { agent: agentId }).catch(() => {});
  };

  const launchableAgents = (data?.agentRegistry.agents ?? []).filter((entry) => entry.capabilities.tabSwitching);

  const {
    launchTarget, launchAgentId, launchInitialPrompt, launchingProject, launchError,
    setLaunchTarget, setLaunchAgentId, setLaunchModel, setLaunchInitialPrompt,
    openLaunchModal, confirmLaunch,
  } = useLaunchModal({ launchableAgents, selectedAgent, setError, launchProject });

  const {
    newProjectOpen, setNewProjectOpen,
    newName, setNewName, newDir, setNewDir, newGitUrl, setNewGitUrl,
    creatingProject, createError, createAndLaunch,
  } = useCreateProject({ openLaunchModal, refresh });
  const runnerAgoMs = lastUpdated && runnerLastPushedAt ? lastUpdated - new Date(runnerLastPushedAt).getTime() : null;
  // Presence is connection-based: an open runner↔bridge SSE connection
  // (runnerConnected === true) means online, full stop — the badge flips in
  // <1s without waiting on the heartbeat. ADDITIVE ROLLOUT: we do NOT treat
  // connected===false as authoritative offline yet, because a pre-rollout
  // runner (no client=runner tag) reports false while heartbeating fine —
  // so offline still requires a stale heartbeat. At cutover (once every runner
  // tags itself) this drops to `runnerConnected === false`.
  // See docs/architecture/connection-presence.md.
  const runnerOffline = !runtimeAvailable && runnerConnected !== true
    && runnerAgoMs !== null && runnerAgoMs > RUNNER_OFFLINE_THRESHOLD_MS;
  const runnerNeverSeen = !runtimeAvailable && runnerConnected !== true && runnerLastPushedAt === null;
  // Only hide cached runtime when the runner has never connected. When offline
  // but we have a last push, show last-known Working/Ready state with a stale label.
  const runtimeStateKnown = !runnerNeverSeen;
  const runnerSyncStale = runnerOffline && runnerLastPushedAt !== null;
  const runtimeSyncCtx = {
    syncStale: runnerSyncStale,
    lastSyncedAt: runnerLastPushedAt,
  };
  const pageState = data ? buildControlPageState(data, nowS, runtimeStateKnown, runnerSyncStale) : null;
  const dashboard = pageState?.dashboard ?? null;
  const attention = pageState?.attention ?? [];
  const liveTabRows = useMemo(
    () => (data ? buildLiveTabRows(data.zellijTabs, data.projects, nowS, runnerSyncStale) : []),
    [data, nowS, runnerSyncStale],
  );
  const snapshots = data
    ? buildProjectOperationsSnapshots(data.projects, data.zellijTabs, nowS, runtimeStateKnown, runtimeSyncCtx)
    : null;

  const failedCount = data?.failedCommands?.length ?? 0;
  const projectOverrideCount = data?.projects.filter((project) => project.autoInjectModeOverride !== null).length ?? 0;

  useEffect(() => {
    if (!snapshots?.length) return;
    const currentValid = selectedTab && snapshots.some((s) => s.project.tab === selectedTab);
    if (currentValid) return;
    const priority = snapshots.find(
      (s) => s.phase === "ready" || s.phase === "orchestration_ready" || s.attentionReason,
    );
    setSelectedTab(priority?.project.tab ?? snapshots[0].project.tab);
  }, [snapshots, selectedTab]);

  // Push notification / palette deep-link: /control?focus=<tab>&switchTo=<agent>
  useEffect(() => {
    if (!focusParam || !data) return;

    const tabLower = focusParam.toLowerCase();
    const snapshot = snapshots?.find((s) => s.project.tab.toLowerCase() === tabLower);
    const snapshotTab = snapshot?.project.tab;
    const liveTab = liveTabRows.find((r) => r.tabName.toLowerCase() === tabLower)?.tabName;
    const resolvedTab = snapshotTab ?? liveTab;
    if (!resolvedTab) return;

    if (snapshotTab) setSelectedTab(snapshotTab);
    setHighlightTab(resolvedTab);
    setLiveTargetTab(resolvedTab);
    if (liveDetailsRef.current) liveDetailsRef.current.open = true;
    livePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    postJson("/api/control/focus-tab", { tab: resolvedTab }).catch(() => { /* best effort */ });

    if (switchToParam && snapshot?.project.dir) {
      const label = switchableRegistry.find((e) => e.id === switchToParam)?.label ?? switchToParam;
      setSwitchNotice(`Switching ${snapshot.project.tab} to ${label}…`);
      postJson("/api/control/switch-agent", {
        tab: snapshot.project.liveTab ?? snapshot.project.tab,
        dir: snapshot.project.dir,
        toAgent: switchToParam,
        fromAgent: snapshot.project.activeAgents[0] ?? snapshot.project.agentPref ?? undefined,
      })
        .then(() => {
          setSwitchNotice(`Switched ${snapshot.project.tab} to ${label}`);
          setTimeout(() => setSwitchNotice(null), 6000);
        })
        .catch(() => {
          setSwitchNotice(`Could not switch ${snapshot.project.tab} to ${label}`);
          setTimeout(() => setSwitchNotice(null), 8000);
        });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    params.delete("switchTo");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [focusParam, switchToParam, data, snapshots, liveTabRows, pathname, router, searchParams, switchableRegistry]);

  // Build cardProps unconditionally — the closure is fine with empty arrays
  // when `data` hasn't loaded yet. ProjectOperationsView only invokes the
  // closure when there's a selected project, which requires `snapshots`,
  // which requires `data` to be non-null. So an empty-array cardProps is
  // never actually called against a real project — it's just a typesafe
  // placeholder for the initial paint.
  //
  // The previous `data!.prompts` non-null assertion lied to the TS compiler
  // and crashed in production with "Cannot read properties of null (reading
  // 'prompts')" the first time a user landed on /control before the SWR
  // fetch resolved. Worse on slow networks, every time on cold reload.
  const cardProps = buildCardProps({
    prompts: data?.prompts ?? [],
    zellijTabs: data?.zellijTabs ?? [],
    selectedAgent,
    switchableRegistry,
    inject,
    runWithBrain,
    runCustomPrompt,
    setError,
    setQueuedNotice,
    refresh,
    openLaunchModal,
    runtimeAvailable,
    runtimeStateKnown,
    runnerSyncStale,
    automationMode: automationPolicy.mode,
    countdownSeconds: automationPolicy.countdownSeconds,
  });

  const livePanelProps = {
    rows: liveTabRows,
    runnerNeverSeen,
    runnerSyncStale,
    refreshing,
    onRefresh: () => refresh(true),
    onFocusProject: setSelectedTab,
    highlightTab,
    initialTargetTab: liveTargetTab,
    panelRef: livePanelRef,
  };

  // One embedded instance for every breakpoint. This used to render twice
  // (mobile embedded + desktop standalone, toggled via md:hidden), and the
  // standalone variant repeated the <summary>'s "Workspaces · N open" header
  // inside the panel — the page showed the same heading and count twice.
  const livePanel = <ZellijLivePanel {...livePanelProps} embedded />;

  return (
    <div className="space-y-6">
      {/* Hierarchy rewrite 2026-05-31: when the runner is offline or never seen,
          the banner with Start/Restart buttons OWNS the top viewport — it's
          the only actionable thing on the page until the user reconnects.
          When healthy, the banner self-hides and FleetStatus is the first thing
          the eye lands on. Also removed the verbose "Agent operations / Current
          work, queued instructions, and saved context by project" section
          header: that subtitle taught the user nothing they couldn't infer
          from the table itself. */}
      {/* Suppress the runner banner during the zero-project empty state —
          EmptyStateWelcome below already pitches "Start a project" / "Install
          Fleet Runner" with the full card grid, and rendering both led to
          the same two CTAs appearing twice on the same screen. The banner
          still fires for users with projects but no runner (legit warning:
          they can't dispatch) and for runner-was-online-now-offline (legit
          troubleshooting). */}
      {!(data && data.projects.length === 0 && runnerNeverSeen && !runnerOffline) && (
        <RunnerStatusBanner
          runnerNeverSeen={runnerNeverSeen}
          runnerOffline={runnerOffline}
          runnerLastPushedAt={runnerLastPushedAt}
          runtimeAvailable={runtimeAvailable}
          hasProjects={(data?.projects.length ?? 0) > 0}
          onRefresh={() => refresh(true)}
        />
      )}

      {/* Desktop-only — surfaces missing zellij + agent CLIs so the user
          knows what to install before dispatching. Renders null outside
          Fleet Runner (no IPC) and when all expected tools are present. */}
      <MissingCLIsBanner />

      {/* New-user welcome card. Shows ONLY when the user has zero registered
          projects — the dead-end blank /control was the worst first-touch
          we had. Three CTAs: import from GitHub (multi-select), add manually,
          install Fleet Runner. Disappears the moment they add anything. */}
      {data && data.projects.length === 0 && (
        <>
          {/* "We already know your work" — two parallel one-click bulk
              imports. GitHub suggestions render for users with a GitHub
              OAuth account linked; LocalDevSuggestions renders inside Fleet
              Runner when ~/dev has git repos. Either or both can be empty
              (collapses to nothing) so the welcome cards still anchor the
              empty state for users without either signal. */}
          <GitHubRepoSuggestions />
          <LocalDevSuggestions />
          <EmptyStateWelcome
            onAddManual={() => setNewProjectOpen(true)}
            // Bootstrap requires the local Fleet Runner runner (writes to ~/dev,
            // shells out to `gh repo create`); hide the CTA when runtime isn't
            // available so we don't 503 the user on click.
            onBootstrap={runtimeAvailable ? () => setBootstrapOpen(true) : undefined}
          />
        </>
      )}

      {/* ControlFleetStatus shows runner health + working/ready/open counters
          + autopilot pill. When the user has 0 projects, all counters are 0
          and the panel reads as noise stacked under the empty-state welcome
          ("Setup needed · Autopilot Manual · 0 working · 0 ready · 0 open
          · All clear"). Hide it in the empty state; the welcome cards are
          the right surface there. Status panel returns as soon as projects
          exist. */}
      {data && data.projects.length > 0 && <ControlFleetStatus
        dashboard={dashboard}
        attentionCount={attention.length}
        failedCount={failedCount}
        runnerNeverSeen={runnerNeverSeen}
        runnerOffline={runnerOffline}
        runnerStateUnknown={runnerNeverSeen}
        runnerLastPushedAt={runnerLastPushedAt}
        lastUpdated={lastUpdated}
        automationMode={automationPolicy.mode}
        automationSaving={automationPolicy.saving}
        refreshing={refreshing}
        onRefresh={() => refresh(true)}
        onAutomationChange={automationPolicy.updateMode}
        onNewProject={() => (runtimeAvailable ? setBootstrapOpen(true) : setNewProjectOpen(true))}
        projectOverrideCount={projectOverrideCount}
      />}

      <AttentionBar items={attention} failedCommands={data?.failedCommands} onFocusProject={setSelectedTab} />

      <ProjectOperationsView
        snapshots={snapshots}
        selectedTab={selectedTab}
        onSelect={setSelectedTab}
        cardProps={cardProps}
      />

      {/* Workspaces panel — collapsed-by-default on every breakpoint when the
          runner is offline or never-seen. The Projects grid above already
          shows every registered project's last-known state; in offline mode
          this panel duplicates the same fact in a different layout (caught in
          dogfood: Projects list + Terminal workspaces both rendering FleetCrown
          with identical status read as broken). When the runner is live the
          panel auto-opens on desktop so the quick send-to-any-tab affordance
          stays one click away. */}
      <details
        ref={liveDetailsRef}
        className="ui-control-live-details"
        open={!runnerNeverSeen && !runnerOffline}
      >
        <summary className="ui-control-live-details-summary">
          <span>Workspaces</span>
          <span className="ui-tag ui-tag-neutral text-micro">
            {runnerNeverSeen
              ? "offline"
              : runnerSyncStale
                ? `${liveTabRows.length} tab${liveTabRows.length === 1 ? "" : "s"} · sync stale`
                : `${liveTabRows.length} tab${liveTabRows.length === 1 ? "" : "s"}`}
          </span>
        </summary>
        <div className="ui-control-live-details-body">{livePanel}</div>
      </details>

      <details className="ui-control-launch-defaults">
        <summary className="ui-control-launch-defaults-summary flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5" />
          Diagnostics and launch settings
        </summary>
        <div className="ui-control-launch-defaults-body space-y-5">
          <section>
            <h3 className="mb-3 text-sm font-medium text-text-secondary">Launch defaults</h3>
            <p className="mb-3 text-xs leading-relaxed text-text-tertiary">
              These choices are used when {APP_NAME} opens a new terminal tab. CLI availability is reported by the connected computer, not by the cloud.
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
          initialPrompt={launchInitialPrompt}
          launching={launchingProject}
          error={launchError}
          onAgentChange={(agentId) => {
            const agent = launchableAgents.find((entry) => entry.id === agentId);
            setLaunchAgentId(agentId);
            setLaunchModel(agent?.defaultModel ?? "");
          }}
          onInitialPromptChange={setLaunchInitialPrompt}
          onLaunch={confirmLaunch}
          onClose={() => setLaunchTarget(null)}
        />
      )}


      {error && <p className="ui-box-error">{error}</p>}
      {(queuedNotice || switchNotice) && (
        <div className="ui-control-notice">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {switchNotice ?? queuedNotice}
        </div>
      )}

    </div>
  );
}
