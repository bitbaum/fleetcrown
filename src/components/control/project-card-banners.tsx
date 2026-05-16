"use client";

import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";
import { ClosedBanner, ClosingBanner, RunningBanner } from "./project-card-helpers";
import { ReadyBanner } from "./ready-banner";

export function ProjectBanners({
  tab,
  isClosed,
  isClosing,
  isReady,
  isOrchReady,
  showRunning,
  session,
  closingAt,
  currentPrompt,
  prompts,
  autoContinueEnabled,
  paused,
  nextQueueItem,
  queueTotal = 0,
  healthBypass,
  dispatchReason,
  onDismiss,
  onSend,
  onAutoInject,
  onToggleAutoContinue,
  showKeyHints = false,
}: {
  tab: string;
  isClosed: boolean;
  isClosing: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  showRunning: boolean;
  session: ProjectState["session"];
  closingAt: number | null;
  currentPrompt: ProjectState["currentPrompt"];
  prompts: PromptMeta[];
  autoContinueEnabled: boolean;
  paused: boolean;
  nextQueueItem?: string;
  queueTotal?: number;
  healthBypass?: string;
  dispatchReason?: string;
  onDismiss: () => void;
  onSend: (key: string) => void;
  onAutoInject?: () => void;
  onToggleAutoContinue?: () => void;
  showKeyHints?: boolean;
}) {
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";

  return (
    <>
      {isClosed && (
        <ClosedBanner
          session={session}
          onContinue={() => onSend(primaryKey)}
          onDismiss={onDismiss}
        />
      )}
      {isClosing && <ClosingBanner startedAt={closingAt!} />}
      {isReady && (
        <ReadyBanner
          tab={tab}
          prompts={prompts}
          onSend={onSend}
          onDismiss={onDismiss}
          onAutoInject={onAutoInject}
          onToggleAutoContinue={onToggleAutoContinue}
          paused={paused}
          title="Agent finished"
          autoContinueEnabled={autoContinueEnabled}
          nextQueueItem={nextQueueItem}
          queueTotal={queueTotal}
          healthBypass={healthBypass}
          dispatchReason={dispatchReason}
          showKeyHints={showKeyHints}
        />
      )}
      {isOrchReady && (
        <ReadyBanner
          tab={tab}
          prompts={prompts}
          onSend={(key) => {
            const intent = mapClaudePromptToIntent(key);
            if (!intent) return;
            onSend(key);
          }}
          onDismiss={onDismiss}
          onAutoInject={onAutoInject}
          onToggleAutoContinue={onToggleAutoContinue}
          paused={paused}
          title="Task finished"
          autoContinueEnabled={autoContinueEnabled}
          nextQueueItem={nextQueueItem}
          queueTotal={queueTotal}
          healthBypass={healthBypass}
          dispatchReason={dispatchReason}
          showKeyHints={showKeyHints}
        />
      )}
      {showRunning && currentPrompt && (
        <RunningBanner label={currentPrompt.label} promptKey={currentPrompt.key} startedAt={currentPrompt.startedAt} />
      )}
    </>
  );
}
