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
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { useProjectLifecycleSync } from "@/hooks/use-project-lifecycle-sync";
import { useProjectCardActions } from "@/hooks/use-project-card-actions";
import type { AutoInjectMode } from "@/config/beacon";

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
  automationMode = "queue_only",
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

  const handleSwitchAgent = async (agentId: string | null) => {
    const currentAgent = project.activeAgents[0] ?? localAgent ?? project.agentPref ?? null;
    setLocalAgent(agentId);
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { agentPref: agentId ?? undefined }).catch(() => {});
    }
    const workspaceTab = project.liveTab ?? project.tab;
    const tabIsOpen = isProjectTabOpen(project, zellijTabs);
    if (agentId && agentId !== currentAgent && tabIsOpen && project.dir) {
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
    }
  };

  const [dismissed, setDismissed] = useState(false);
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue } = useAutoContinue(project.tab);
  const { queue, enqueue, remove: removeFromQueue, reorder: reorderInQueue, edit: editInQueue, clear: clearQueue, mergeItems: mergeItemsInQueue } = usePromptQueue(project.tab);

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
  const automaticContinuationEnabled = autoContinueEnabled && (
    automationMode === "strategist" ||
    automationMode === "next_best" ||
    (automationMode === "queue_only" && queue.length > 0)
  );
  const queuePolicyWaiting = automationMode === "queue_only" && autoContinueEnabled && queue.length === 0;
  const tabOpenUntracked = display.tone === "idle" && display.tabOpen && !display.isRunning;
  const automationStatusLabel = tabOpenUntracked
    ? "Tab open on your computer — focus the workspace to check the agent, or send a prompt below."
    : automationMode === "off"
    ? "Manual: this project waits for your instruction."
    : !autoContinueEnabled
      ? "Automatic continuation paused for this project."
      : queuePolicyWaiting
        ? "Continue queued work: add an instruction to run it when the agent waits."
        : automationMode === "queue_only"
          ? "Continue queued work: the next queued instruction will send when the agent waits."
          : "Autonomous: the next task may start when the agent waits.";

  const {
    sending, custom, setCustom, customFocused, setCustomFocused,
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
      <ProjectCardHeader
        project={project}
        tabOpen={display.tabOpen}
        isClosed={display.isClosed}
        isClosing={display.isClosing}
        isReady={display.isReady}
        isOrchReady={display.isOrchestrationReady}
        isRunning={display.isRunning}
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
            dispatchReason={!sessionHealthBlocksQueue() && preloadedDispatch?.source === "groq" ? preloadedDispatch.reason : undefined}
            onDismiss={() => setDismissed(true)}
            onSend={send}
            onAutoInject={runtimeAvailable !== false ? handleAutoInject : undefined}
            onToggleAutoContinue={automationMode === "off" || queuePolicyWaiting ? undefined : toggleAutoContinue}
            showKeyHints={isOnlyReady}
            inactiveLabel={queuePolicyWaiting ? "Queue empty" : undefined}
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
          {display.showLatestOrchestration && latestOrchRun && <LatestOrchestrationPanel run={latestOrchRun} />}

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
                  : "Terminal tab is open, but Cockpit is not tracking an active prompt. The agent may be idle, or status has not synced yet."}
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
          />
          <ProjectActivitySection injections={project.recentInjections} git={project.git} />
        </>
      )}
    </div>
  );
}
