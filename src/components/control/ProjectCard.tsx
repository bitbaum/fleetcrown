"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { postJson, patchJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getProjectDisplayState } from "./control-presenter";
import { ProjectProfile } from "./ProjectProfile";
import { LatestOrchestrationPanel } from "./project-card-helpers";
import {
  ProjectCardHeader, SessionSummary, ProjectBanners, ProjectActivitySection,
} from "./project-card-sections";
import { IntentButtonPanel } from "./project-intent-panel";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { useProjectLifecycleSync } from "@/hooks/use-project-lifecycle-sync";
import { isAutoContinueEnabledSync } from "@/lib/control-storage";

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
  isOnlyReady = false,
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
  onFocus?: () => void;
  isOnlyReady?: boolean;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [localAgent, setLocalAgent] = useState<string | null>(project.agentPref ?? null);

  const handleSwitchAgent = async (agentId: string | null) => {
    setLocalAgent(agentId);
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { agentPref: agentId ?? undefined }).catch(() => {});
    }
  };
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
  useProjectLifecycleSync(project.tab, isReadyNow, enableAutoContinue);

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

  // Pausing: also cancel any open beacon popup so its independent countdown doesn't fire.
  // Sync state to /tmp sentinel so the PyQt popup respects pause even when Cockpit is down.
  const handleToggleAutoContinue = () => {
    const nowEnabled = !autoContinueEnabled;
    toggleAutoContinueHook();
    postJson("/api/control/auto-continue", { tab: project.tab, enabled: nowEnabled }).catch(() => {});
    if (!nowEnabled) {
      postJson("/api/beacon/cancel", { tab: project.tab }).catch(() => {});
    }
  };

  const paused = !autoContinueEnabled || customFocused || custom.trim().length > 0 || display.isBeaconActive;

  // Keyboard: 1–9 dispatch prompt slots when this is the sole ready project on the page.
  // Mirrors the beacon popup pattern. Guards inputs/textareas and in-progress sends.
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const sendingRef = useRef(sending);
  useEffect(() => { sendingRef.current = sending; }, [sending]);

  useEffect(() => {
    if (!isOnlyReady) return;
    const handler = (e: KeyboardEvent) => {
      if (sendingRef.current) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = parseInt(e.key);
      if (!isNaN(n) && n >= 1 && n <= 9) {
        const all = [
          ...prompts.filter((p) => p.style === "primary"),
          ...prompts.filter((p) => p.style === "action"),
        ];
        const pick = all.find((p) => p.slot === n) ?? all[n - 1];
        if (pick) sendRef.current(pick.key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOnlyReady, prompts]);

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
        isRunning={display.isRunning}
        profileOpen={profileOpen}
        onProfileToggle={() => setProfileOpen((v) => !v)}
        onCollapse={onCollapse}
        onFocus={onFocus}
        availableAgents={availableAgents}
        localAgentId={localAgent}
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
            nextQueueItem={queue[0]}
            queueTotal={queue.length}
            onDismiss={() => setDismissed(true)}
            onSend={send}
            onAutoInject={handleAutoInject}
            onToggleAutoContinue={handleToggleAutoContinue}
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
          <ProjectActivitySection injections={project.recentInjections} git={project.git} />
        </>
      )}
    </div>
  );
}
