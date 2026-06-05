"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Plus, Settings2 } from "lucide-react";
import { timeAgo } from "@/lib/dates";
import { postJson } from "@/lib/api/fetch";
import { useControlData } from "@/hooks/use-control-data";
import { useLaunchModal } from "@/hooks/use-launch-modal";
import { useCreateProject } from "@/hooks/use-create-project";
import { buildControlPageState, buildProjectOperationsSnapshots, buildLiveTabRows } from "./control-presenter";
import { ControlFleetStatus } from "./ControlFleetStatus";
import { AttentionBar } from "./AttentionBar";
import { DaemonStatusBanner } from "./DaemonStatusBanner";
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
    daemonSyncStale,
    automationMode: automationPolicy.mode,
    countdownSeconds: automationPolicy.countdownSeconds,
  });

  // Fleet counts (running/ready/etc) intentionally live in ControlFleetStatus
  // below — they were rendered here too with subtly different labels ("waiting"
  // here, "ready" in the chip strip) for the same underlying value, which read
  // as a math bug in user testing. Header keeps only the page freshness hint
  // and the New-project affordance; the fleet status section owns counts.
  const headerRight = (
    <div className="flex items-center gap-2.5 text-sm text-text-tertiary">
      {data ? (
        <>
          {(daemonNeverSeen || daemonOffline) && (
            <span className="h-1.5 w-1.5 rounded-full bg-status-warning" title="Daemon offline — see banner below" />
          )}
          {lastUpdated && <span title="Page state last refreshed">{timeAgo(lastUpdated)}</span>}
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

      {/* New-user welcome card. Shows ONLY when the user has zero registered
          projects — the dead-end blank /control was the worst first-touch
          we had. Three CTAs: import from GitHub (multi-select), add manually,
          install Fleet Runner. Disappears the moment they add anything. */}
      {data && data.projects.length === 0 && (
        <EmptyStateWelcome
          onAddManual={() => setNewProjectOpen(true)}
          // Bootstrap requires the local Fleet Runner daemon (writes to ~/dev,
          // shells out to `gh repo create`); hide the CTA when runtime isn't
          // available so we don't 503 the user on click.
          onBootstrap={runtimeAvailable ? () => setBootstrapOpen(true) : undefined}
        />
      )}

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

      {/* Workspaces panel — collapsed-by-default on every breakpoint when the
          daemon is offline or never-seen. The Projects grid above already
          shows every registered project's last-known state; in offline mode
          this panel duplicates the same fact in a different layout (caught in
          dogfood: Projects list + Terminal workspaces both rendering FleetCrown
          with identical status read as broken). When the daemon is live the
          panel auto-opens on desktop so the quick send-to-any-tab affordance
          stays one click away. */}
      <details
        ref={liveDetailsRef}
        className="ui-control-live-details"
        open={!daemonNeverSeen && !daemonOffline}
      >
        <summary className="ui-control-live-details-summary">
          <span>Workspaces</span>
          <span className="ui-tag ui-tag-neutral text-micro">
            {daemonNeverSeen ? "offline" : daemonSyncStale ? `${liveTabRows.length} open · stale` : `${liveTabRows.length} open`}
          </span>
        </summary>
        <div className="ui-control-live-details-body md:hidden">{livePanelMobile}</div>
        <div className="ui-control-live-details-body hidden md:block">{livePanelDesktop}</div>
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
              These choices are used when {APP_NAME} opens a new terminal tab. CLI availability is reported by the connected computer, not by Vercel.
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
