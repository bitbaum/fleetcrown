"use client";

import { useState } from "react";
import {
  Circle, ExternalLink,
  SlidersHorizontal, ChevronsDown, Focus, Copy, Check, Activity, FolderKanban,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { compactRelativeDate, timeAgo } from "@/lib/dates";
import { postJson } from "@/lib/api/fetch";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { ProjectState } from "@/lib/control-types";
import type { ActivityItem } from "@/db/queries/prompt-history";
import type { PromptMeta } from "@/lib/agent-config";
import {
  ClosedBanner, ClosingBanner, RunningBanner, ReadyBanner,
} from "./project-card-helpers";
import { buildSessionHandoffFromProjectSession, SessionHandoff } from "./SessionHandoff";
import { buildProjectActivityLedger } from "./project-activity-ledger";
import { ProjectStatusChips } from "./ProjectStatusChips";

export function ProjectCardHeader({
  project,
  tabOpen,
  isClosed,
  isReady,
  isOrchReady,
  isRunning,
  profileOpen,
  onProfileToggle,
  onCollapse,
  onFocus,
  availableAgents,
  localAgentId,
  switchingAgent,
  onSwitchAgent,
}: {
  project: ProjectState;
  tabOpen: boolean;
  isClosed: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  isRunning: boolean;
  profileOpen: boolean;
  onProfileToggle: () => void;
  onCollapse?: () => void;
  onFocus?: () => void;
  availableAgents?: { id: string; label: string; modelSuggestions: string[] }[];
  localAgentId?: string | null;
  switchingAgent?: boolean;
  onSwitchAgent?: (agentId: string | null) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const { git, session, profile } = project;

  const isIdle = !project.agentRunning && !isRunning && !isReady && !isOrchReady && !isClosed;
  const lastActiveMs = session?.mtime ?? (project.closedAt ? project.closedAt * 1000 : null);
  const lastActiveLabel = lastActiveMs
    ? compactRelativeDate(new Date(lastActiveMs))
    : git?.lastWhen ?? null;
  const stateLabel = isClosed
    ? "Closed"
    : isReady || isOrchReady
    ? "Waiting"
    : isRunning
    ? "Working"
    : project.agentRunning
    ? "Ready"
    : "Idle";

  const dotColor = isRunning
    ? "text-accent-text animate-pulse"
    : project.agentRunning
    ? "text-text-secondary"
    : isClosed || isReady || isOrchReady
    ? "text-status-positive"
    : "text-text-muted";

  return (
    <div className="px-4 py-4 sm:px-5 md:px-6">
      <div className="ui-card-header !mb-0">
        <div className="ui-card-header-main space-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Circle className={cn("h-2.5 w-2.5 shrink-0 fill-current", dotColor)} />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold text-text-primary sm:text-lg" title={project.tab}>
                  {project.tab}
                </span>
                <span className={cn(
                  "ui-tag gap-1.5",
                  isRunning ? "ui-tag-warning" : isClosed || isReady || isOrchReady ? "ui-tag-positive" : "ui-tag-neutral",
                )}>
                  {stateLabel}
                </span>
              </div>
              {isIdle && lastActiveLabel && (
                <p className="mt-0.5 text-xs text-text-muted">
                  last handoff {lastActiveLabel}
                </p>
              )}
              {/* Profile status when no health available (any state) */}
              {profile?.status && !session?.health && (
                <p className="mt-1 truncate text-sm text-text-tertiary" title={profile.status}>{profile.status}</p>
              )}
            </div>
          </div>

          <ProjectStatusChips
            project={project}
            tabOpen={tabOpen}
            availableAgents={availableAgents}
            localAgentId={localAgentId}
            switchingAgent={switchingAgent}
            onSwitchAgent={onSwitchAgent}
          />
          {git && git.behindRemote > 0 && (
            <div className="ui-control-card-header-meta">
              <button
                onClick={async () => {
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const res = await postJson("/api/project/sync", { dir: project.dir });
                    const data = await res.json();
                    setSyncResult(res.ok ? "✓" : (data.error ?? "Failed"));
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                title="Bring the latest saved work from GitHub onto this computer."
                className="ui-chip-action-compact border-status-warning/30 text-status-warning hover:text-text-primary"
              >
                {syncing ? "…" : "Update from GitHub"}
              </button>
              {syncResult && <span>{syncResult}</span>}
            </div>
          )}
        </div>

        <div className="ui-card-actions shrink-0 self-start">
          {project.projectId && (
            <Link
              href={`/projects?open=${project.projectId}`}
              className="ui-icon-action"
              title="Project details"
            >
              <FolderKanban className="h-4 w-4" />
            </Link>
          )}
          {profile?.url && (
            <a
              href={profile.url.startsWith("http") ? profile.url : `https://${profile.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-icon-action"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button
            onClick={onProfileToggle}
            title={profileOpen ? "Close profile" : "Project profile"}
            className={cn(
              "ui-icon-action",
              profileOpen ? "text-accent-text" : "text-text-muted",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          {onFocus && (
            <button
              onClick={onFocus}
              title="Focus on this project"
              className="ui-icon-action"
            >
              <Focus className="h-4 w-4" />
            </button>
          )}
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse"
              className="ui-icon-action"
            >
              <ChevronsDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SessionSummary({
  session,
  isClosed,
}: {
  session: ProjectState["session"];
  isClosed: boolean;
}) {
  if (isClosed || !session) return null;
  return <SessionHandoff data={buildSessionHandoffFromProjectSession(session)} />;
}

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

export function ProjectActivitySection({
  injections,
  git,
}: {
  injections: ActivityItem[];
  git: ProjectState["git"];
}) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const ledger = buildProjectActivityLedger({ injections, git });
  const promptCount = ledger.filter((event) => event.kind === "user_prompt").length;
  const commitCount = ledger.filter((event) => event.kind === "git_commit").length;
  const hasGitActivity = (git?.todayCount ?? 0) > 0 || commitCount > 0;
  if (ledger.length === 0 && !hasGitActivity) return null;

  const copyPrompt = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => current === id ? null : current), 1500);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div className="border-t border-border-subtle px-4 py-2.5 sm:px-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 ui-link-muted"
      >
        <Activity className="h-3.5 w-3.5" />
        <span className="font-medium">Activity</span>
        {promptCount > 0 && <span className="text-text-muted/60">{promptCount} sent</span>}
        {(git?.todayCount ?? 0) > 0 && <span className="text-status-positive/80">+{git?.todayCount} commits</span>}
        <span className="ml-auto">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {promptCount > 0 && (
            <div className="space-y-1.5">
              <p className="ui-kicker">Sent prompts</p>
              {ledger.filter((event) => event.kind === "user_prompt").map((event) => {
                const fullText = event.body;
                const preview = fullText.length > 70 ? `${fullText.slice(0, 70).trimEnd()}...` : fullText;
                const isExpanded = expandedId === event.id;
                const canCopy = Boolean(fullText.trim());

                return (
                  <div key={event.id} className="rounded-lg border border-transparent px-1.5 py-1 transition-colors hover:border-border-subtle hover:bg-surface-raised/50">
                    <div className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 pt-0.5 text-text-muted tabular-nums">
                        {event.occurredAt ? timeAgo(event.occurredAt) : ""}
                      </span>
                      <button
                        onClick={() => setExpandedId((current) => current === event.id ? null : event.id)}
                        className="min-w-0 flex-1 truncate text-left text-text-tertiary transition-colors hover:text-text-secondary"
                        title={fullText}
                      >
                        {preview}
                      </button>
                      {canCopy && (
                        <button
                          onClick={() => copyPrompt(event.id, fullText)}
                          className="inline-flex min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 shrink-0 items-center justify-center rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
                          title="Copy full prompt"
                        >
                          {copiedId === event.id ? <Check className="h-3 w-3 text-status-positive" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-2 rounded-lg border border-border-subtle bg-surface-overlay p-3">
                        <pre className="max-h-48 whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary">{fullText}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {commitCount > 0 && (
            <div className="space-y-1.5">
              <p className="ui-kicker">Recent commits</p>
              <div className="space-y-1.5">
                {ledger.filter((event) => event.kind === "git_commit").map((event) => (
                  <div key={event.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 font-mono text-text-muted/60 tabular-nums">{event.title}</span>
                    <span className="min-w-0 flex-1 text-text-tertiary">{event.body}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
