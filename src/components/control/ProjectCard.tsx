"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson, patchJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getProjectDisplayState, isProjectTabOpen, type ProjectOperationsSnapshot } from "./control-presenter";
import { ProjectProfile } from "./ProjectProfile";
import { LatestOrchestrationPanel } from "./project-card-helpers";
import { ProjectCardHeader, SessionSummary } from "./project-card-sections";
import { ProjectBanners } from "./project-card-banners";
import { ProjectActivitySection } from "./project-card-activity";
import { IntentButtonPanel } from "./project-intent-panel";
import { ProjectAutopilotToggle } from "./ProjectAutopilotToggle";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { useProjectLifecycleSync } from "@/hooks/use-project-lifecycle-sync";
import { useProjectCardActions } from "@/hooks/use-project-card-actions";
import type { AutoInjectMode } from "@/config/beacon";
import { CapacityIssueBanner } from "./CapacityIssueBanner";
import {
  detectCapacityIssueFromProject,
  resolveNextFallbackAgent,
  resolveOutgoingAgent,
} from "@/lib/agent-resolution";

export function ProjectCard({
  project,
  prompts,
  zellijTabs,
  currentAdapter,
  availableAgents,
  onInject,
  onRunWithBrain,
  onRunCustomPrompt,
  onCollapse,
  onFocus,
  onDeleted,
  onProfileSaved,
  onLaunch,
  isOnlyReady = false,
  runtimeAvailable = true,
  runtimeStateKnown = true,
  daemonSyncStale = false,
  snapshot,
  automationMode = "on",
  countdownSeconds,
}: {
  project: ProjectState;
  prompts: PromptMeta[];
  zellijTabs: string[];
  currentAdapter: string;
  availableAgents: { id: string; label: string; modelSuggestions: string[] }[];
  onInject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
  onRunWithBrain: (project: ProjectState, intent: OrchestrationTaskIntentId) => Promise<void>;
  onRunCustomPrompt: (project: ProjectState, prompt: string, agent: string) => Promise<void>;
  onCollapse?: () => void;
  onFocus?: () => void;
  onDeleted?: () => void;
  onProfileSaved?: () => void;
  onLaunch?: () => void;
  isOnlyReady?: boolean;
  runtimeAvailable?: boolean;
  runtimeStateKnown?: boolean;
  /** True when cloud view is showing last-known daemon state (sync >90s old). */
  daemonSyncStale?: boolean;
  snapshot?: ProjectOperationsSnapshot;
  automationMode?: AutoInjectMode;
  countdownSeconds?: number;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [localAgent, setLocalAgent] = useState<string | null>(project.agentPref ?? null);
  const [switchingAgent, setSwitchingAgent] = useState(false);
  const [capacityDismissed, setCapacityDismissed] = useState(false);

  const installedAgentIds = availableAgents.map((a) => a.id);
  const outgoingAgent = resolveOutgoingAgent(project, localAgent);
  const capacityIssue = detectCapacityIssueFromProject(project);
  const suggestedFallback = resolveNextFallbackAgent(outgoingAgent, installedAgentIds);

  useEffect(() => {
    if (capacityIssue) setCapacityDismissed(false);
  }, [capacityIssue, project.session?.mtime, project.currentPrompt?.label]);

  const performAgentSwitch = async (agentId: string) => {
    const currentAgent = resolveOutgoingAgent(project, localAgent);
    setLocalAgent(agentId);
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { agentPref: agentId }).catch(() => {});
    }
    const workspaceTab = project.liveTab ?? project.tab;
    const tabIsOpen = isProjectTabOpen(project, zellijTabs);
    if (agentId === currentAgent || !tabIsOpen || !project.dir) return;

    setSwitchingAgent(true);
    try {
      await postJson("/api/control/switch-agent", {
        tab: workspaceTab,
        dir: project.dir,
        toAgent: agentId,
        fromAgent: currentAgent ?? undefined,
      });
    } catch { /* best effort */ } finally {
      setSwitchingAgent(false);
    }
  };

  const handleSwitchAgent = async (agentId: string | null) => {
    if (!agentId) {
      setLocalAgent(null);
      if (project.id) {
        patchJson(`/api/user-projects/${project.id}`, { agentPref: undefined }).catch(() => {});
      }
      return;
    }
    await performAgentSwitch(agentId);
  };

  const [dismissed, setDismissed] = useState(false);
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue } = useAutoContinue(project.tab, project.autoContinueEnabled);
  const { queue, enqueue, remove: removeFromQueue, reorder: reorderInQueue, edit: editInQueue, clear: clearQueue, mergeItems: mergeItemsInQueue } = usePromptQueue(project.tab, project.promptQueue, project.promptQueueRevision);

  // Reset dismissed each time a new agent run begins so the ready banner fires once per cycle.
  const prevAgentRunning = useRef(project.agentRunning);
  useEffect(() => {
    if (!prevAgentRunning.current && project.agentRunning) setDismissed(false);
    prevAgentRunning.current = project.agentRunning;
  }, [project.agentRunning]);

  const nowS = Math.floor(Date.now() / 1000);
  const display = dismissed
    ? getProjectDisplayState(project, zellijTabs, nowS, true, runtimeStateKnown)
    : snapshot?.display ?? getProjectDisplayState(project, zellijTabs, nowS, false, runtimeStateKnown);
  const isReadyNow = display.isReady || display.isOrchestrationReady;
  useProjectLifecycleSync(project.tab, isReadyNow);
  // After the 2026-06-11 collapse autopilot is binary. "on" continues when
  // the agent self-reports ready; "off" never does. The queue is drained
  // head-first; nextbest fills in when the queue runs dry. Auto-continue
  // remains a per-project pause/resume toggle independent of the mode.
  const automaticContinuationEnabled = autoContinueEnabled && automationMode === "on";
  const tabOpenUntracked = display.tone === "idle" && display.tabOpen && !display.isRunning;
  const automationStatusLabel = tabOpenUntracked
    ? "Tab open on your computer — focus the workspace to check the agent, or send a prompt below."
    : automationMode === "off"
      ? "Autopilot off: this project waits for your instruction."
      : !autoContinueEnabled
        ? "Automatic continuation paused for this project."
        : queue.length > 0
          ? "Autopilot on: the next queued instruction will send when the agent waits."
          : "Autopilot on: next_best will fire when the agent waits (queue is empty).";

  const {
    sending, justSent, custom, setCustom, customFocused, setCustomFocused,
    merging, preloadedDispatch, sendError, clearSendError,
    sendCustom, sendText, sessionHealthBlocksQueue, sendIntent, send,
    handleAutoInject, handleSendFromQueue, handleMergeQueue,
  } = useProjectCardActions({
    project, queue, removeFromQueue, clearQueue,
    onInject, onRunWithBrain,
    setDismissed, isReadyNow,
    prompts, isOnlyReady, autoContinueEnabled: automaticContinuationEnabled,
  });

  const latestOrchRun = project.latestOrchestrationRun;
  const showPreviousRunPanel = display.showLatestOrchestration && !display.tabOpen;
  const queueBlockedReason = sessionHealthBlocksQueue() && queue.length > 0
    ? project.session?.health?.toLowerCase().includes("critical")
      ? "Health critical"
      : "Tests failing"
    : null;
  const paused = !automaticContinuationEnabled || customFocused || custom.trim().length > 0 || display.isBeaconActive;

  // Smart "send to queue" (user request #2):
  // - If the project is currently idle/ready (nothing being done), treat the
  //   queue action as an immediate send (fills the ready slot right now).
  // - Otherwise, add to the persistent prompt_queue so it gets injected
  //   automatically once the current task finishes (via handleAutoInject etc.).
  // This unifies "type or pick from library/history → send to queue".
  // Works for both the textarea (Alt+Enter) and the ListPlus button, and
  // the mic "enqueue after recording" path (via onEnqueueCustom).
  const smartEnqueue = useCallback((text: string) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    // Special case for deliberate handoff-controlled prompts the user pastes
    // (e.g. starting with "status: working" + full task). These should almost
    // always go direct so the user can drive the agent intentionally.
    const isHandoffControl = /^status:\s*(working|ready)/i.test(trimmed);

    if (isHandoffControl) {
      sendText(trimmed);
      return;
    }

    const idle = !project.agentRunning
      && !display.isRunning
      && (isReadyNow || display.tone === "idle" || display.isReady || display.isOrchestrationReady);
    if (idle) {
      sendText(trimmed);
    } else {
      enqueue(trimmed);
    }
  }, [enqueue, sendText, project.agentRunning, display.isRunning, display.tone, isReadyNow, display.isReady, display.isOrchestrationReady]);

  return (
    <div
      className={cn(
        "ui-card-shell-raised overflow-hidden",
        display.isClosed
          ? "border-status-positive/30 bg-status-positive/[0.02]"
          : display.isClosing
          ? "border-status-warning/25 bg-status-warning/[0.02]"
          : display.isReady || display.isOrchestrationReady
          ? "border-status-positive/40 bg-status-positive/[0.03]"
          : display.isSessionOpen
          ? "border-accent-primary/25 bg-accent-primary/[0.02]"
          : "border-border-subtle bg-surface-base"
      )}
    >
      {capacityIssue && suggestedFallback && !capacityDismissed && (
        <CapacityIssueBanner
          currentAgentId={outgoingAgent ?? project.agentPref ?? "claude"}
          nextAgentId={suggestedFallback}
          switching={switchingAgent}
          onSwitch={() => performAgentSwitch(suggestedFallback)}
          onDismiss={() => setCapacityDismissed(true)}
        />
      )}

      <ProjectCardHeader
        project={project}
        tabOpen={display.tabOpen}
        isClosed={display.isClosed}
        isClosing={display.isClosing}
        isReady={display.isReady}
        isOrchReady={display.isOrchestrationReady}
        isRunning={display.isRunning}
        stateKey={display.stateKey}
        stateLabel={display.stateLabel}
        stateTagClass={display.stateTagClass}
        evidenceLabel={snapshot?.evidenceLabel}
        evidenceAt={snapshot?.evidenceAt}
        evidenceKind={snapshot?.evidenceKind}
        profileOpen={profileOpen}
        onProfileToggle={() => setProfileOpen((v) => !v)}
        onCollapse={onCollapse}
        onFocus={onFocus}
        availableAgents={availableAgents}
        localAgentId={localAgent}
        switchingAgent={switchingAgent}
        onSwitchAgent={handleSwitchAgent}
        runtimeStateKnown={runtimeStateKnown}
      />

      {/* Per-project autopilot pause/resume. Hidden when no entity id is
          available (legacy paths-only projects can't be overridden — see
          ProjectAutopilotToggle for the rationale). */}
      <div className="px-4 pt-2 sm:px-5 md:px-6">
        <ProjectAutopilotToggle
          projectId={project.projectId}
          currentOverride={project.autoInjectModeOverride}
          inheritedMode={automationMode}
        />
        {/* What pressing play is FOR — the profile's next step, visible
            without opening the profile. Play/pause means nothing if you
            can't see what the fleet intends to do next. */}
        {project.profile?.attrs?.["next_step"] && (
          <p
            className="mt-1.5 truncate text-xs text-text-tertiary"
            title={project.profile.attrs["next_step"]}
          >
            <span className="font-medium text-text-secondary">Next:</span>{" "}
            {project.profile.attrs["next_step"]}
          </p>
        )}
      </div>

      {profileOpen ? (
        <ProjectProfile
          project={project}
          globalAdapter={currentAdapter}
          localAgent={localAgent}
          availableAgents={availableAgents}
          onSetAgent={setLocalAgent}
          onFillPrompt={setCustom}
          onRunPrompt={(prompt, agent) => onRunCustomPrompt(project, prompt, agent)}
          onDeleted={onDeleted}
          onProfileSaved={onProfileSaved}
        />
      ) : (
        <>
          <ProjectBanners
            tab={project.tab}
            isClosed={display.isClosed}
            isClosing={display.isClosing}
            isReady={display.isReady}
            isOrchReady={display.isOrchestrationReady}
            showRunning={display.showRunningBanner}
            session={project.session}
            closingAt={project.closingAt}
            currentPrompt={project.currentPrompt}
            prompts={prompts}
            autoContinueEnabled={automaticContinuationEnabled}
            paused={paused}
            nextQueueItem={sessionHealthBlocksQueue() ? undefined : queue[0]}
            queueTotal={sessionHealthBlocksQueue() ? 0 : queue.length}
            healthBypass={sessionHealthBlocksQueue() && queue.length > 0 ? (project.session?.health?.toLowerCase().includes("critical") ? "Health critical" : "Tests failing") : undefined}
            dispatchReason={undefined}
            onDismiss={() => setDismissed(true)}
            onSend={send}
            onAutoInject={runtimeAvailable !== false ? handleAutoInject : undefined}
            onToggleAutoContinue={automationMode === "off" ? undefined : toggleAutoContinue}
            showKeyHints={isOnlyReady}
            inactiveLabel={undefined}
            countdownSeconds={countdownSeconds}
          />
          {(display.isReady || display.isOrchestrationReady) && (
            <SessionSummary session={project.session} isClosed={display.isClosed} />
          )}
          {display.tone === "idle" && project.session && !display.tabOpen && (
            <div className="border-t border-border-subtle">
              <p className="px-4 pt-4 text-xs font-medium text-text-muted sm:px-5 md:px-6">Saved context from the last agent run</p>
              <SessionSummary session={project.session} isClosed={false} />
            </div>
          )}
          {showPreviousRunPanel && latestOrchRun && <LatestOrchestrationPanel run={latestOrchRun} />}

          {display.tone === "idle" && !display.tabOpen && runtimeStateKnown && onLaunch && (
            <div className="ui-card-section flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-text-secondary">No agent is currently running for this project.</p>
              <button onClick={onLaunch} className="ui-btn-primary shrink-0 gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Launch agent
              </button>
            </div>
          )}
          {display.tone === "idle" && display.tabOpen && !display.isRunning && (
            <div className="ui-card-section">
              <p className="text-sm text-text-secondary">
                {daemonSyncStale
                  ? "Terminal tab is open on your computer, but live status is stale. Check the tab locally or repair the daemon connection."
                  : "Terminal tab is open, but FleetCrown is not tracking an active prompt. The agent may be idle, or status has not synced yet."}
              </p>
            </div>
          )}

          <IntentButtonPanel
            project={project}
            currentAdapter={currentAdapter}
            runtimeAvailable={runtimeAvailable}
            runtimeStateKnown={runtimeStateKnown}
            daemonSyncStale={daemonSyncStale}
            isRunning={display.isRunning}
            autoContinueEnabled={automationMode === "off" ? false : autoContinueEnabled}
            sending={sending}
            justSent={justSent}
            sendError={sendError}
            onClearSendError={clearSendError}
            custom={custom}
            queue={queue}
            bannerActive={display.isClosed || display.isReady || display.isOrchestrationReady}
            merging={merging}
            onToggleAutoContinue={automationMode === "off" ? undefined : toggleAutoContinue}
            onSendIntent={sendIntent}
            onSendCustom={sendCustom}
            onEnqueueCustom={smartEnqueue}
            onSendText={sendText}
            onSendFromQueue={handleSendFromQueue}
            onRemoveFromQueue={removeFromQueue}
            onReorderInQueue={reorderInQueue}
            onEditInQueue={editInQueue}
            onMergeQueue={handleMergeQueue}
            onMergeItemsInQueue={mergeItemsInQueue}
            onCustomChange={setCustom}
            onCustomFocusChange={setCustomFocused}
            automationStatusLabel={automationStatusLabel}
            queueBlockedReason={queueBlockedReason}
          />
          <ProjectActivitySection
            injections={project.recentInjections}
            git={project.git}
            projectTab={project.tab}
            onReusePrompt={setCustom}
          />
        </>
      )}
    </div>
  );
}
