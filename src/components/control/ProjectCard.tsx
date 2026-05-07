"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ProjectState, PromptMeta } from "@/app/api/control/route";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { getProjectDisplayState } from "./control-presenter";
import { ProjectProfile } from "./ProjectProfile";
import { LatestOrchestrationPanel } from "./project-card-helpers";
import {
  ProjectCardHeader, SessionSummary, ProjectBanners, IntentButtonPanel,
} from "./project-card-sections";

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
  const [localAgent, setLocalAgent] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customFocused, setCustomFocused] = useState(false);
  const [typingActive, setTypingActive] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const autoContinueKey = `control:auto-continue:${project.tab.toLowerCase()}`;
  const [autoContinueEnabled, setAutoContinueEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(autoContinueKey) !== "off";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(autoContinueKey, autoContinueEnabled ? "on" : "off");
    } catch { /* ignore storage failures */ }
  }, [autoContinueEnabled, autoContinueKey]);

  useEffect(() => {
    let clearAt: ReturnType<typeof setTimeout> | undefined;
    const markTyping = () => {
      setTypingActive(true);
      if (clearAt) clearTimeout(clearAt);
      clearAt = setTimeout(() => setTypingActive(false), 8000);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      markTyping();
    };
    window.addEventListener("keydown", onKeyDown, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (clearAt) clearTimeout(clearAt);
    };
  }, []);

  const nowS = Math.floor(Date.now() / 1000);
  const display = getProjectDisplayState(project, zellijTabs, nowS, dismissed);
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

  const sendIntent = async (intent: OrchestrationTaskIntentId) => {
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
          await onRunWithBrain(project, intent);
        } else {
          await onInject(project.tab, promptKey);
        }
      }
      if (!promptKey) setCustom("");
    } finally {
      setSending(null);
    }
  };

  const paused = !autoContinueEnabled || typingActive || customFocused || custom.trim().length > 0;

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
      {profileOpen && (
        <ProjectProfile
          project={project}
          globalAdapter={currentAdapter}
          localAgent={localAgent}
          availableAgents={availableAgents}
          onSetAgent={setLocalAgent}
          onRunPrompt={(prompt, agent) => onRunCustomPrompt(project, prompt, agent)}
        />
      )}

      {!profileOpen && (
        <>
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
          <SessionSummary session={project.session} isClosed={display.isClosed} />
          <ProjectBanners
            isClosed={display.isClosed}
            isClosing={display.isClosing}
            isReady={display.isReady}
            isOrchReady={display.isOrchestrationReady}
            showRunning={display.showRunningBanner}
            session={project.session}
            git={project.git}
            closingAt={project.closingAt}
            currentPrompt={project.currentPrompt}
            prompts={prompts}
            autoContinueEnabled={autoContinueEnabled}
            paused={paused}
            onDismiss={() => setDismissed(true)}
            onSend={send}
          />
          {display.showLatestOrchestration && latestOrchRun && <LatestOrchestrationPanel run={latestOrchRun} />}

          <IntentButtonPanel
            project={project}
            currentAdapter={currentAdapter}
            autoContinueEnabled={autoContinueEnabled}
            sending={sending}
            custom={custom}
            bannerActive={display.isClosed || display.isReady || display.isOrchestrationReady}
            onToggleAutoContinue={() => setAutoContinueEnabled((v) => !v)}
            onSendIntent={sendIntent}
            onSendCustom={sendCustom}
            onCustomChange={setCustom}
            onCustomFocusChange={setCustomFocused}
          />
        </>
      )}
    </div>
  );
}
