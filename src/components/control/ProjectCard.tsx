"use client";

import { useState, useEffect } from "react";
import { ChevronsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  READY_WINDOW_S, CLOSED_WINDOW_S, CLOSING_WINDOW_S, withinWindow,
} from "@/lib/constants/control";
import type { ProjectState, PromptMeta } from "@/app/api/control/route";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
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
  const [activeTab, setActiveTab] = useState<"status" | "profile">("status");
  const [localAgent, setLocalAgent] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customFocused, setCustomFocused] = useState(false);
  const [typingActive, setTypingActive] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [autoContinueEnabled, setAutoContinueEnabled] = useState(true);
  const autoContinueKey = `control:auto-continue:${project.tab.toLowerCase()}`;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(autoContinueKey);
      if (stored === "off") setAutoContinueEnabled(false);
      if (stored === "on") setAutoContinueEnabled(true);
    } catch { /* ignore storage failures */ }
  }, [autoContinueKey]);

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
  const isClosed   = !dismissed && !project.agentRunning && withinWindow(project.closedAt, nowS, CLOSED_WINDOW_S);
  const isClosing  = !dismissed && !isClosed && withinWindow(project.closingAt, nowS, CLOSING_WINDOW_S);
  const isReady    = !dismissed && !isClosed && !isClosing && !project.agentRunning && withinWindow(project.readyAt, nowS, READY_WINDOW_S);

  const latestOrchRun = project.latestOrchestrationRun;
  const latestOrchFinishedAtS = latestOrchRun?.finishedAt
    ? Math.floor(new Date(latestOrchRun.finishedAt).getTime() / 1000)
    : null;
  const isOrchReady =
    !dismissed && !isReady && !isClosed && !isClosing && !project.agentRunning &&
    latestOrchRun?.state === "done" &&
    withinWindow(latestOrchFinishedAtS, nowS, READY_WINDOW_S);

  const showRunning = !isClosing && project.currentPrompt !== null && project.agentRunning;

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

  const tabOpen = zellijTabs.some((t) => t.toLowerCase() === (project.liveTab ?? project.tab).toLowerCase());
  const paused = !autoContinueEnabled || typingActive || customFocused || custom.trim().length > 0;

  return (
    <div
      className={cn(
        "ui-panel-raised overflow-hidden",
        isClosed
          ? "border-status-positive/30 bg-status-positive/[0.02]"
          : isClosing
          ? "border-status-warning/25 bg-status-warning/[0.02]"
          : isReady || isOrchReady
          ? "border-status-positive/40 bg-status-positive/[0.03]"
          : project.agentRunning
          ? "border-accent-primary/25 bg-accent-primary/[0.02]"
          : "border-border-subtle bg-surface-base"
      )}
    >
      <div className="flex items-stretch border-b border-border-subtle">
        <button
          onClick={() => setActiveTab("status")}
          className={cn(
            "px-5 py-2.5 text-sm font-medium transition-colors",
            activeTab === "status"
              ? "border-b-2 border-accent-primary text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Status
        </button>
        <button
          onClick={() => setActiveTab("profile")}
          className={cn(
            "px-5 py-2.5 text-sm font-medium transition-colors",
            activeTab === "profile"
              ? "border-b-2 border-accent-primary text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Profile
        </button>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse to tile"
            className="ml-auto flex items-center gap-1.5 px-3.5 py-2 text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            <ChevronsDown className="h-3.5 w-3.5" />
            Collapse
          </button>
        )}
      </div>

      {activeTab === "profile" && (
        <ProjectProfile
          project={project}
          globalAdapter={currentAdapter}
          localAgent={localAgent}
          availableAgents={availableAgents}
          onSetAgent={setLocalAgent}
          onRunPrompt={(prompt, agent) => onRunCustomPrompt(project, prompt, agent)}
        />
      )}

      {activeTab === "status" && (
        <>
          <ProjectCardHeader
            project={project}
            tabOpen={tabOpen}
            isClosed={isClosed}
            isReady={isReady}
            isOrchReady={isOrchReady}
          />
          <SessionSummary session={project.session} git={project.git} isClosed={isClosed} />
          <ProjectBanners
            isClosed={isClosed}
            isClosing={isClosing}
            isReady={isReady}
            isOrchReady={isOrchReady}
            showRunning={showRunning}
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
          {latestOrchRun && <LatestOrchestrationPanel run={latestOrchRun} />}

          <IntentButtonPanel
            project={project}
            currentAdapter={currentAdapter}
            autoContinueEnabled={autoContinueEnabled}
            sending={sending}
            custom={custom}
            bannerActive={isClosed || isReady || isOrchReady}
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
