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
import type { DispatchResult } from "@/app/api/control/dispatch/route";

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
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [localAgent, setLocalAgent] = useState<string | null>(project.agentPref ?? null);
  const [switchingAgent, setSwitchingAgent] = useState(false);

  const handleSwitchAgent = async (agentId: string | null) => {
    // Determine current agent: what's actively detected in the process list, or saved pref.
    const currentAgent = project.activeAgents[0] ?? localAgent ?? project.agentPref ?? null;

    setLocalAgent(agentId);

    // Always persist the preference.
    if (project.id) {
      patchJson(`/api/user-projects/${project.id}`, { agentPref: agentId ?? undefined }).catch(() => {});
    }

    // If the tab is open and we're switching to a real different agent, inject the switch.
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
  const [custom, setCustom] = useState("");
  const [customFocused, setCustomFocused] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinueHook, enable: enableAutoContinue } = useAutoContinue(project.tab);

  const { queue, enqueue, shift: shiftQueue, remove: removeFromQueue, reorder: reorderInQueue, edit: editInQueue, clear: clearQueue } = usePromptQueue(project.tab);
  const [merging, setMerging] = useState(false);
  const [preloadedDispatch, setPreloadedDispatch] = useState<DispatchResult | null>(null);

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

  // Pre-fetch dispatch decision as soon as the ready banner appears so the
  // banner can show the AI's reasoning before the countdown fires.
  useEffect(() => {
    if (!isReadyNow || queue.length === 0) {
      setPreloadedDispatch(null);
      return;
    }
    const handoff = {
      done:   project.session?.done   ?? "",
      next:   project.session?.next   ?? "",
      health: project.session?.health ?? "",
      tests:  project.session?.tests  ?? "",
      todos:  project.session?.todos  ?? "",
    };
    let cancelled = false;
    postJson("/api/control/dispatch", {
      handoff,
      queue,
      projectName:   project.tab,
      gitBranch:     project.git?.branch,
      recentCommits: project.git?.recentCommits,
    }).then(async (res) => {
      if (!cancelled && res.ok) setPreloadedDispatch(await res.json() as DispatchResult);
    }).catch(() => {});
    return () => { cancelled = true; };
  // Re-fetch when queue length or ready state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadyNow, queue.length]);

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

  // Returns true when the session's handoff signals the project is broken — queue drain
  // would pivot the agent away from the current broken thread, compounding the damage.
  // Only "critical" health or explicitly failing tests trigger the gate; "needs attention"
  // is a softer signal that does not prevent queue drain.
  const sessionHealthBlocksQueue = (): boolean => {
    const health = (project.session?.health ?? "").toLowerCase();
    const tests  = (project.session?.tests  ?? "").toLowerCase();
    return health.includes("critical") || tests.includes("fail");
  };

  const sendIntent = async (intent: OrchestrationTaskIntentId) => {
    // Drain queue first when next_best is requested — unless the session health
    // signals a broken state, in which case next_best must stay focused on recovery.
    if (intent === "next_best" && !sessionHealthBlocksQueue()) {
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

  // When auto-continue countdown fires: ask the dispatch route (Groq) whether to drain
  // the queue or run next_best. Uses the preloaded decision when available; otherwise
  // fetches inline. Re-reads localStorage synchronously so cross-window beacon Pause
  // events are respected even if React state hasn't caught up yet.
  const handleAutoInject = useCallback(async () => {
    if (!isAutoContinueEnabledSync(project.tab)) return;

    // Hard gate: critical health / failing tests always stay in recovery mode.
    if (sessionHealthBlocksQueue()) {
      await sendIntent("next_best");
      return;
    }

    // Use the already-fetched dispatch decision, or fall back to queue-first.
    const decision = preloadedDispatch;
    const action = decision?.action ?? (queue.length > 0 ? "queue" : "nextbest");

    if (action === "queue") {
      const queued = shiftQueue();
      if (queued) {
        setSending("custom");
        setDismissed(true);
        try {
          await onInject(project.tab, undefined, queued);
        } finally {
          setSending(null);
        }
        return;
      }
    }

    await sendIntent("next_best");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadedDispatch, shiftQueue, queue.length, project.tab, onInject, project.session?.health, project.session?.tests]);

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

  const handleToggleAutoContinue = toggleAutoContinueHook;

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
