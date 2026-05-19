"use client";

import { useState } from "react";
import {
  Circle, ExternalLink,
  SlidersHorizontal, ChevronsDown, Focus, FolderKanban,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { compactRelativeDate } from "@/lib/dates";
import { postJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import { buildSessionHandoffFromProjectSession, SessionHandoff } from "./SessionHandoff";
import { ProjectStatusChips } from "./ProjectStatusChips";

export function ProjectCardHeader({
  project,
  tabOpen,
  isClosed,
  isClosing,
  isReady,
  isOrchReady,
  isRunning,
  stateLabel,
  stateTagClass,
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
  isClosing: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  isRunning: boolean;
  stateLabel: string;
  stateTagClass: string;
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

  const isIdle = !project.agentRunning && !isRunning && !isReady && !isOrchReady && !isClosed && !isClosing;
  const lastActiveMs = session?.mtime ?? (project.closedAt ? project.closedAt * 1000 : null);
  const lastActiveLabel = lastActiveMs
    ? compactRelativeDate(new Date(lastActiveMs))
    : git?.lastWhen ?? null;

  const dotColor = isRunning
    ? "text-accent-text animate-pulse"
    : isClosing
    ? "text-status-warning"
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
                <span className={cn("gap-1.5", stateTagClass)}>
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

