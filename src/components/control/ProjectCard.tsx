"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { postJson, patchJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getProjectDisplayState } from "./control-presenter";
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
  isOnlyReady = false,
  runtimeAvailable = true,
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
  isOnlyReady?: boolean;
  runtimeAvailable?: boolean;
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
    const tabIsOpen = zellijTabs.some((t) => t.toLowerCase() === workspaceTab.toLowerCase());
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
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue, enable: enableAutoContinue } = useAutoContinue(project.tab);
  const { queue, enqueue, shift: shiftQueue, remove: removeFromQueue, reorder: reorderInQueue, edit: editInQueue, clear: clearQueue, mergeItems: mergeItemsInQueue } = usePromptQueue(project.tab);

  // Reset dismissed each time a new agent run begins so the ready banner fires once per cycle.
  const prevAgentRunning = useRef(project.agentRunning);
  useEffect(() => {
    if (!prevAgentRunning.current && project.agentRunning) setDismissed(false);
    prevAgentRunning.current = project.agentRunning;
  }, [project.agentRunning]);

  const nowS = Math.floor(Date.now() / 1000);
  const display = getProjectDisplayState(project, zellijTabs, nowS, dismissed);
  const isReadyNow = display.isReady || display.isOrchestrationReady;
  useProjectLifecycleSync(project.tab, isReadyNow, enableAutoContinue);

  const {
    sending, custom, setCustom, customFocused, setCustomFocused,
    merging, preloadedDispatch,
    sendCustom, sendText, sessionHealthBlocksQueue, sendIntent, send,
    handleAutoInject, handleSendFromQueue, handleMergeQueue,
  } = useProjectCardActions({
    project, queue, shiftQueue, removeFromQueue, clearQueue,
    onInject, onRunWithBrain,
    setDismissed, isReadyNow,
    prompts, isOnlyReady,
  });

  const latestOrchRun = project.latestOrchestrationRun;
  const paused = !autoContinueEnabled || customFocused || custom.trim().length > 0 || display.isBeaconActive;

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
          : project.agentRunning
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
        profileOpen={profileOpen}
        onProfileToggle={() => setProfileOpen((v) => !v)}
        onCollapse={onCollapse}
        onFocus={onFocus}
        availableAgents={availableAgents}
        localAgentId={localAgent}
        switchingAgent={switchingAgent}
        onSwitchAgent={handleSwitchAgent}
      />

      {profileOpen ? (
        <ProjectProfile
          project={project}
          globalAdapter={currentAdapter}
          localAgent={localAgent}
          availableAgents={availableAgents}
          onSetAgent={setLocalAgent}
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
            autoContinueEnabled={autoContinueEnabled}
            paused={paused}
            nextQueueItem={sessionHealthBlocksQueue() ? undefined : queue[0]}
            queueTotal={sessionHealthBlocksQueue() ? 0 : queue.length}
            healthBypass={sessionHealthBlocksQueue() && queue.length > 0 ? (project.session?.health?.toLowerCase().includes("critical") ? "Health critical" : "Tests failing") : undefined}
            dispatchReason={!sessionHealthBlocksQueue() && preloadedDispatch?.source === "groq" ? preloadedDispatch.reason : undefined}
            onDismiss={() => setDismissed(true)}
            onSend={send}
            onAutoInject={runtimeAvailable !== false ? handleAutoInject : undefined}
            onToggleAutoContinue={toggleAutoContinue}
            showKeyHints={isOnlyReady}
          />
          {(display.isReady || display.isOrchestrationReady) && (
            <SessionSummary session={project.session} isClosed={display.isClosed} />
          )}
          {display.showLatestOrchestration && latestOrchRun && <LatestOrchestrationPanel run={latestOrchRun} />}

          <IntentButtonPanel
            project={project}
            currentAdapter={currentAdapter}
            isRunning={display.isRunning}
            autoContinueEnabled={autoContinueEnabled}
            sending={sending}
            custom={custom}
            queue={queue}
            bannerActive={display.isClosed || display.isReady || display.isOrchestrationReady}
            merging={merging}
            onToggleAutoContinue={toggleAutoContinue}
            onSendIntent={sendIntent}
            onSendCustom={sendCustom}
            onEnqueueCustom={enqueue}
            onSendText={sendText}
            onSendFromQueue={handleSendFromQueue}
            onRemoveFromQueue={removeFromQueue}
            onReorderInQueue={reorderInQueue}
            onEditInQueue={editInQueue}
            onMergeQueue={handleMergeQueue}
            onMergeItemsInQueue={mergeItemsInQueue}
            onCustomChange={setCustom}
            onCustomFocusChange={setCustomFocused}
          />
          <ProjectActivitySection injections={project.recentInjections} git={project.git} />
        </>
      )}
    </div>
  );
}
