"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getProjectDisplayState } from "./control-presenter";
import { ProjectProfile } from "./ProjectProfile";
import { LatestOrchestrationPanel } from "./project-card-helpers";
import {
  ProjectCardHeader, SessionSummary, ProjectBanners,
} from "./project-card-sections";
import { IntentButtonPanel } from "./project-intent-panel";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { isAutoContinueEnabledSync, readyAtKey } from "@/lib/control-storage";

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
}: {
  project: ProjectState;
  prompts: PromptMeta[];
  zellijTabs: string[];
  currentAdapter: string;
  availableAgents: { id: string; label: string }[];
  onInject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
  onRunWithBrain: (project: ProjectState, intent: OrchestrationTaskIntentId) => Promise<void>;
  onRunCustomPrompt: (project: ProjectState, prompt: string, agent: string) => Promise<void>;
  onCollapse?: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [localAgent, setLocalAgent] = useState<string | null>(project.agentPref ?? null);
  const [custom, setCustom] = useState("");
  const [customFocused, setCustomFocused] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinueHook, enable: enableAutoContinue } = useAutoContinue(project.tab);

  const { queue, enqueue, shift: shiftQueue, remove: removeFromQueue, reorder: reorderInQueue, edit: editInQueue, clear: clearQueue } = usePromptQueue(project.tab);
  const [merging, setMerging] = useState(false);

  // Reset dismissed each time a new agent run begins so the ready banner fires once per cycle.
  const prevAgentRunning = useRef(project.agentRunning);
  useEffect(() => {
    if (!prevAgentRunning.current && project.agentRunning) {
      setDismissed(false);
    }
    prevAgentRunning.current = project.agentRunning;
  }, [project.agentRunning]);

  const nowS = Math.floor(Date.now() / 1000);
  const display = getProjectDisplayState(project, zellijTabs, nowS, dismissed);

  // Write/clear readyAt timestamp so the beacon popup can initialise its countdown
  // from the same origin — both views show the same remaining seconds.
  // Also re-enable auto-continue on each new ready cycle — persisted "off" from a
  // previous session shouldn't carry over and leave the countdown permanently paused.
  const isReadyNow = display.isReady || display.isOrchestrationReady;
  const prevIsReadyRef = useRef(false);
  useEffect(() => {
    if (isReadyNow && !prevIsReadyRef.current) {
      try { localStorage.setItem(readyAtKey(project.tab), Date.now().toString()); } catch {}
      enableAutoContinue();
    } else if (!isReadyNow && prevIsReadyRef.current) {
      try { localStorage.removeItem(readyAtKey(project.tab)); } catch {}
    }
    prevIsReadyRef.current = isReadyNow;
  }, [isReadyNow, project.tab, enableAutoContinue]);
  const latestOrchRun = project.latestOrchestrationRun;

  const sendCustom = async () => {
    if (!custom.trim()) return;
    setSending("custom");
    setDismissed(true);
    try {
      await onInject(project.tab, undefined, custom.trim());
      setCustom("");
    } finally {
      setSending(null);
    }
  };

  // Used by IntentButtonPanel after recording stops — custom state may be stale at that point
  const sendText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setSending("custom");
    setDismissed(true);
    try {
      await onInject(project.tab, undefined, text.trim());
    } finally {
      setSending(null);
    }
  }, [project.tab, onInject]);

  const sendIntent = async (intent: OrchestrationTaskIntentId) => {
    // Drain queue first when next_best is requested — queue takes priority over AI-generated plan.
    if (intent === "next_best") {
      const queued = shiftQueue();
      if (queued) {
        setSending("custom");
        setDismissed(true);
        try { await onInject(project.tab, undefined, queued); }
        finally { setSending(null); }
        return;
      }
    }
    setSending(intent);
    setDismissed(true);
    try {
      await onRunWithBrain(project, intent);
    } finally {
      setSending(null);
    }
  };

  // Legacy send for banner prompt keys — maps to intent where possible
  const send = async (promptKey?: string, customPrompt?: string) => {
    setSending(promptKey ?? "custom");
    setDismissed(true);
    try {
      if (customPrompt) {
        await onInject(project.tab, undefined, customPrompt);
      } else if (promptKey) {
        const intent = mapClaudePromptToIntent(promptKey);
        if (intent) {
          // Drain queue first when next_best is requested (same logic as sendIntent).
          if (intent === "next_best") {
            const queued = shiftQueue();
            if (queued) {
              await onInject(project.tab, undefined, queued);
            } else {
              await onRunWithBrain(project, intent);
            }
          } else {
            await onRunWithBrain(project, intent);
          }
        } else {
          await onInject(project.tab, promptKey);
        }
      }
      if (!promptKey) setCustom("");
    } finally {
      setSending(null);
    }
  };

  // When auto-continue countdown fires: drain the queue first, fall back to next_best.
  // Re-read localStorage synchronously before injecting — cross-window storage events
  // (from beacon popup Pause button) can arrive after the React countdown effect has
  // already scheduled this call, so React state may not reflect the latest pause state.
  const handleAutoInject = useCallback(async () => {
    if (!isAutoContinueEnabledSync(project.tab)) return;

    const queued = shiftQueue();
    if (queued) {
      setSending("custom");
      setDismissed(true);
      try {
        await onInject(project.tab, undefined, queued);
      } finally {
        setSending(null);
      }
    } else {
      await sendIntent("next_best");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftQueue, project.tab, onInject]);

  // Send a specific queue item immediately (remove it + inject)
  const handleSendFromQueue = useCallback(async (index: number) => {
    const item = queue[index];
    if (!item) return;
    removeFromQueue(index);
    setSending("custom");
    setDismissed(true);
    try {
      await onInject(project.tab, undefined, item);
    } finally {
      setSending(null);
    }
  }, [queue, removeFromQueue, project.tab, onInject]);

  // Merge all queue items into one coherent prompt via AI, then load into input
  const handleMergeQueue = useCallback(async () => {
    if (queue.length < 2) return;
    setMerging(true);
    try {
      const res = await postJson("/api/control/merge-prompts", { prompts: queue });
      const data = await res.json();
      if (data.merged) {
        clearQueue();
        setCustom(data.merged);
      }
    } catch { /* ignore */ } finally {
      setMerging(false);
    }
  }, [queue, clearQueue]);

  // Pausing: also cancel any open beacon popup so its independent countdown doesn't fire
  const handleToggleAutoContinue = () => {
    toggleAutoContinueHook();
    if (autoContinueEnabled) {
      postJson("/api/beacon/cancel", { tab: project.tab }).catch(() => {});
    }
  };

  const paused = !autoContinueEnabled || customFocused || custom.trim().length > 0;

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
        isReady={display.isReady}
        isOrchReady={display.isOrchestrationReady}
        profileOpen={profileOpen}
        onProfileToggle={() => setProfileOpen((v) => !v)}
        onCollapse={onCollapse}
      />

      {profileOpen ? (
        <ProjectProfile
          project={project}
          globalAdapter={currentAdapter}
          localAgent={localAgent}
          availableAgents={availableAgents}
          onSetAgent={setLocalAgent}
          onRunPrompt={(prompt, agent) => onRunCustomPrompt(project, prompt, agent)}
        />
      ) : (
        <>
          <SessionSummary session={project.session} isClosed={display.isClosed} />
          <ProjectBanners
            tab={project.tab}
            isClosed={display.isClosed}
            isClosing={display.isClosing}
            isReady={display.isReady}
            isOrchReady={display.isOrchestrationReady}
            isRunning={display.isRunning}
            showRunning={display.showRunningBanner}
            session={project.session}
            git={project.git}
            closingAt={project.closingAt}
            currentPrompt={project.currentPrompt}
            prompts={prompts}
            autoContinueEnabled={autoContinueEnabled}
            paused={paused}
            nextQueueItem={queue[0]}
            queueTotal={queue.length}
            onDismiss={() => setDismissed(true)}
            onSend={send}
            onAutoInject={handleAutoInject}
          />
          {display.showLatestOrchestration && latestOrchRun && <LatestOrchestrationPanel run={latestOrchRun} />}

          <IntentButtonPanel
            project={project}
            currentAdapter={currentAdapter}
            autoContinueEnabled={autoContinueEnabled}
            sending={sending}
            custom={custom}
            queue={queue}
            bannerActive={display.isClosed || display.isReady || display.isOrchestrationReady}
            merging={merging}
            onToggleAutoContinue={handleToggleAutoContinue}
            onSendIntent={sendIntent}
            onSendCustom={sendCustom}
            onEnqueueCustom={enqueue}
            onSendText={sendText}
            onSendFromQueue={handleSendFromQueue}
            onRemoveFromQueue={removeFromQueue}
            onReorderInQueue={reorderInQueue}
            onEditInQueue={editInQueue}
            onMergeQueue={handleMergeQueue}
            onCustomChange={setCustom}
            onCustomFocusChange={setCustomFocused}
          />
        </>
      )}
    </div>
  );
}
