"use client";

import { useState, useRef, useEffect } from "react";
import { GitBranch, Terminal, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import { formatAgentRuntimeLabel } from "./control-presenter";

type AgentEntry = { id: string; label: string };

function statusChipClass(tone: "neutral" | "positive" | "warning" = "neutral", clickable = false) {
  return cn(
    "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-none transition-colors",
    tone === "positive"
      ? "border-status-positive/25 bg-status-positive/[0.08] text-status-positive"
      : tone === "warning"
      ? "border-status-warning/30 bg-status-warning/[0.08] text-status-warning"
      : "border-border-subtle bg-surface-raised text-text-tertiary",
    clickable && "hover:border-border-default hover:bg-surface-overlay hover:text-text-secondary",
  );
}

function pendingChangesLabel(project: ProjectState): string | null {
  const dirtyCount = project.git?.dirtyCount ?? 0;
  if (!project.git?.dirty) return null;
  if (dirtyCount <= 0) return "Changes pending";
  return `${dirtyCount} pending change${dirtyCount === 1 ? "" : "s"}`;
}

function AgentSwitcherPopover({
  agents,
  activeAgentId,
  onSwitch,
  onClose,
}: {
  agents: AgentEntry[];
  activeAgentId: string;
  onSwitch: (agentId: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1.5 min-w-[130px] rounded-xl border border-border-default bg-surface-overlay py-1.5 shadow-card"
    >
      <p className="px-3 pb-1 pt-0.5 text-micro uppercase tracking-wide text-text-muted">Switch agent</p>
      {agents.map((agent) => {
        const isActive = agent.id === activeAgentId;
        return (
          <button
            key={agent.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSwitch(isActive ? null : agent.id); onClose(); }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-surface-raised",
              isActive ? "text-accent-text" : "text-text-secondary",
            )}
          >
            {isActive && <Check className="h-3 w-3 shrink-0" />}
            <span className={isActive ? "font-medium" : "pl-5"}>{agent.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ProjectStatusChips({
  project,
  tabOpen,
  compact = false,
  clickableWorkspace = true,
  availableAgents,
  localAgentId,
  onSwitchAgent,
}: {
  project: ProjectState;
  tabOpen: boolean;
  compact?: boolean;
  clickableWorkspace?: boolean;
  availableAgents?: AgentEntry[];
  localAgentId?: string | null;
  onSwitchAgent?: (agentId: string | null) => void;
}) {
  const [gitHelpOpen, setGitHelpOpen] = useState(false);
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<"idle" | "loading" | "done">("idle");
  const runtimeLabel = formatAgentRuntimeLabel(project);
  const git = project.git;
  const workspaceTab = project.liveTab ?? project.tab;
  const changesLabel = pendingChangesLabel(project);
  const dirtyHelp = git?.dirty
    ? `Pending changes means files were edited in this project but are not saved into Git history yet. Branch: ${git.branch}. In Git, a commit is the checkpoint that records those changes.`
    : `Branch: ${git?.branch}. No local file changes detected.`;

  // localAgentId wins (reflects in-session switch before next API poll)
  const effectiveAgentId = localAgentId ?? project.agentPref ?? (availableAgents?.[0]?.id ?? "");
  const canSwitchAgent = onSwitchAgent && availableAgents && availableAgents.length > 1;

  const focusWorkspace = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (workspaceState === "loading") return;
    setWorkspaceState("loading");
    try {
      await postJson("/api/control/focus-tab", { tab: workspaceTab });
      setWorkspaceState("done");
      setTimeout(() => setWorkspaceState("idle"), 2000);
    } catch {
      setWorkspaceState("idle");
    }
  };

  if (!runtimeLabel && !git && !tabOpen) return null;

  const chips = (
    <div className={compact ? "flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-tertiary" : "ui-control-card-header-meta"}>
      {runtimeLabel && (
        canSwitchAgent ? (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAgentPopoverOpen((v) => !v); }}
              title={`${runtimeLabel} — click to switch agent for this project`}
              className={compact
                ? "flex items-center gap-1 text-text-secondary transition-colors hover:text-text-primary"
                : cn(statusChipClass(project.currentPrompt ? "warning" : "neutral", true), "cursor-pointer")}
            >
              <span>{project.currentPrompt ? `${runtimeLabel} working` : `${runtimeLabel} ready`}</span>
              <ChevronDown className={cn("h-3 w-3 shrink-0 opacity-50 transition-transform", agentPopoverOpen && "rotate-180")} />
            </button>
            {agentPopoverOpen && (
              <AgentSwitcherPopover
                agents={availableAgents!}
                activeAgentId={effectiveAgentId}
                onSwitch={onSwitchAgent!}
                onClose={() => setAgentPopoverOpen(false)}
              />
            )}
          </div>
        ) : (
          <span
            className={compact ? undefined : statusChipClass(project.currentPrompt ? "warning" : "neutral")}
            title={`${runtimeLabel} is currently detected in this project workspace. This comes from local process detection, not a cloud status API.`}
          >
            {project.currentPrompt ? `${runtimeLabel} working` : `${runtimeLabel} ready`}
          </span>
        )
      )}

      {(tabOpen || !compact) && clickableWorkspace && tabOpen && (
        <button
          type="button"
          onClick={focusWorkspace}
          disabled={workspaceState === "loading"}
          title={workspaceState === "done"
            ? "Zellij tab switched — switch to your terminal window to see it"
            : `Switch to the ${workspaceTab} tab in Zellij. You'll need to focus your terminal window.`}
          className={compact
            ? cn("transition-colors", workspaceState === "done" ? "text-status-positive" : "text-status-positive/70 hover:text-status-positive")
            : cn(statusChipClass("positive", true), workspaceState === "done" && "border-status-positive/50 bg-status-positive/15")}
        >
          {!compact && <Terminal className="h-3.5 w-3.5" />}
          {workspaceState === "done" ? "Tab switched ✓" : "Open workspace"}
        </button>
      )}

      {git && compact && (
        <span
          className={cn(git.dirty && "text-status-warning")}
          title={dirtyHelp}
        >
          {changesLabel ?? git.branch}
        </span>
      )}

      {git && !compact && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setGitHelpOpen((open) => !open);
          }}
          className={statusChipClass(git.dirty ? "warning" : "neutral", true)}
          title={dirtyHelp}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span className="max-w-[16rem] truncate">
            {changesLabel ?? git.branch}
          </span>
        </button>
      )}

      {git && git.behindRemote > 0 && (
        <span
          className="text-status-warning"
          title={`${git.behindRemote} commit${git.behindRemote > 1 ? "s" : ""} from GitHub are not on this computer yet.`}
        >
          Behind {git.behindRemote}
        </span>
      )}
    </div>
  );

  if (compact || !gitHelpOpen || !git) return chips;

  return (
    <div className="space-y-2">
      {chips}
      <div className="max-w-xl rounded-xl border border-border-subtle bg-surface-raised px-3.5 py-3 text-xs leading-relaxed text-text-tertiary">
        {git.dirty ? (
          <>
            <p className="font-medium text-text-secondary">{changesLabel} are waiting to be saved into Git history.</p>
            <p className="mt-1">
              This means files changed on this computer. A commit is the checkpoint that records those changes so they can be reviewed, shared, or pushed later.
            </p>
          </>
        ) : (
          <p>No local file changes are waiting. This workspace is clean on branch <span className="font-medium text-text-secondary">{git.branch}</span>.</p>
        )}
        <p className="mt-2 text-text-muted">Branch: <span className="font-medium text-text-secondary">{git.branch}</span></p>
      </div>
    </div>
  );
}
