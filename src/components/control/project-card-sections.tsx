"use client";

import { useState } from "react";
import {
  GitBranch, Circle, Terminal, ExternalLink,
  SlidersHorizontal, ChevronsDown, Loader2, Focus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compactRelativeDate, timeAgo } from "@/lib/dates";
import { postJson } from "@/lib/api/fetch";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import { getHealthShort } from "@/lib/constants/control";
import { getIntentLabel } from "@/config/control-intents";
import type { ProjectState } from "@/lib/control-types";
import type { ActivityItem } from "@/db/queries/prompt-history";
import type { PromptMeta } from "@/lib/agent-config";
import {
  SessionBadge, ClosedBanner, ClosingBanner, RunningBanner, ReadyBanner,
} from "./project-card-helpers";
import { splitSessionItems } from "@/lib/session-content";

export function ProjectCardHeader({
  project,
  tabOpen,
  isClosed,
  isReady,
  isOrchReady,
  profileOpen,
  onProfileToggle,
  onCollapse,
  onFocus,
}: {
  project: ProjectState;
  tabOpen: boolean;
  isClosed: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  profileOpen: boolean;
  onProfileToggle: () => void;
  onCollapse?: () => void;
  onFocus?: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const { git, session, profile } = project;

  const isIdle = !project.agentRunning && !isReady && !isOrchReady && !isClosed;
  const lastActiveMs = session?.mtime ?? (project.closedAt ? project.closedAt * 1000 : null);
  const lastActiveLabel = lastActiveMs
    ? compactRelativeDate(new Date(lastActiveMs))
    : git?.lastWhen ?? null;
  const healthShort = session?.health ? getHealthShort(session.health) : null;

  const dotColor = project.agentRunning
    ? "text-accent-text animate-pulse"
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
                {tabOpen && (
                  <span title="Terminal open" className="ui-tag ui-tag-neutral gap-1.5">
                    <Terminal className="h-3 w-3 shrink-0" />
                    Live tab
                  </span>
                )}
                {/* Health badge only for active/ready/closed — idle projects fold it into the context line below */}
                {!isIdle && session?.health && <SessionBadge health={session.health} />}
              </div>
              {/* Idle context line: "last 2d ago · good" — replaces the health badge for quiet projects */}
              {isIdle && (lastActiveLabel || healthShort) && (
                <p className="mt-0.5 text-xs text-text-muted">
                  {[lastActiveLabel && `last ${lastActiveLabel}`, healthShort].filter(Boolean).join(" · ")}
                </p>
              )}
              {/* Profile status when no health available (any state) */}
              {profile?.status && !session?.health && (
                <p className="mt-1 truncate text-sm text-text-tertiary" title={profile.status}>{profile.status}</p>
              )}
            </div>
          </div>

          {git && (
            <div className="ui-control-card-header-meta">
              <div className="flex min-w-0 items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />
                <span className="max-w-[16rem] truncate" title={git.branch}>{git.branch}</span>
                {git.dirty && <span className="text-status-warning" title="Uncommitted changes">✎</span>}
                {git.todayCount > 0 && (
                  <span className="text-status-positive/80" title={`${git.todayCount} commit${git.todayCount > 1 ? "s" : ""} today`}>+{git.todayCount}</span>
                )}
              </div>
              {git.behindRemote > 0 && (
                <>
                  <span className="text-status-warning">↓{git.behindRemote}</span>
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
                    className="ui-chip-action-compact border-status-warning/30 text-status-warning hover:text-text-primary"
                  >
                    {syncing ? "…" : "pull"}
                  </button>
                  {syncResult && <span>{syncResult}</span>}
                </>
              )}
            </div>
          )}
        </div>

        <div className="ui-card-actions shrink-0 self-start">
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

function BulletList({ items, icon, iconClass, textClass }: {
  items: string[];
  icon: string;
  iconClass: string;
  textClass: string;
}) {
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3">
          <span className={cn("shrink-0 select-none font-bold leading-relaxed", iconClass)}>{icon}</span>
          <p className={cn("select-text text-base leading-relaxed", textClass)}>{item}</p>
        </div>
      ))}
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
  const [expanded, setExpanded] = useState(false);

  if (isClosed || !session) return null;
  if (!session.next && !session.done) return null;

  const nextItems = session.next ? splitSessionItems(session.next) : [];
  const doneItems = session.done ? splitSessionItems(session.done) : [];
  const needsExpand = nextItems.length > 1 || doneItems.length > 0;

  // Collapsed: one primary next item visible, "Show all" toggle if there's more
  if (!expanded) {
    const preview = nextItems[0] ?? doneItems[0] ?? "";
    return (
      <div className="ui-card-section">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 shrink-0 select-none font-bold text-accent-text">→</span>
            <p className="select-text text-base leading-relaxed text-text-primary">{preview}</p>
          </div>
          {needsExpand && (
            <button
              onClick={() => setExpanded(true)}
              className="shrink-0 whitespace-nowrap text-sm text-text-muted transition-colors hover:text-text-secondary"
            >
              Show all ↓
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded: full list with section labels
  return (
    <div className="ui-card-section space-y-5">
      <div className="flex items-center justify-between">
        <span className="ui-kicker text-accent-text">Agent&apos;s plan</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          ↑ Collapse
        </button>
      </div>
      {nextItems.length > 0 && (
        <BulletList items={nextItems} icon="→" iconClass="text-accent-text" textClass="text-text-primary" />
      )}
      {doneItems.length > 0 && (
        <div className="space-y-2.5">
          <p className="ui-kicker">Done</p>
          <BulletList items={doneItems} icon="✓" iconClass="text-status-positive" textClass="text-text-secondary" />
        </div>
      )}
    </div>
  );
}

export function ProjectBanners({
  tab,
  isClosed,
  isClosing,
  isReady,
  isOrchReady,
  isRunning,
  showRunning,
  session,
  git,
  closingAt,
  currentPrompt,
  prompts,
  autoContinueEnabled,
  paused,
  nextQueueItem,
  queueTotal = 0,
  onDismiss,
  onSend,
  onAutoInject,
  showKeyHints = false,
}: {
  tab: string;
  isClosed: boolean;
  isClosing: boolean;
  isReady: boolean;
  isOrchReady: boolean;
  isRunning: boolean;
  showRunning: boolean;
  session: ProjectState["session"];
  git: ProjectState["git"];
  closingAt: number | null;
  currentPrompt: ProjectState["currentPrompt"];
  prompts: PromptMeta[];
  autoContinueEnabled: boolean;
  paused: boolean;
  nextQueueItem?: string;
  queueTotal?: number;
  onDismiss: () => void;
  onSend: (key: string) => void;
  onAutoInject?: () => void;
  showKeyHints?: boolean;
}) {
  const primaryKey = prompts.find((p) => p.style === "primary")?.key ?? "next_best";

  return (
    <>
      {isClosed && (
        <ClosedBanner
          session={session}
          git={git}
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
          paused={paused}
          title="Agent finished"
          autoContinueEnabled={autoContinueEnabled}
          nextQueueItem={nextQueueItem}
          queueTotal={queueTotal}
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
          paused={paused}
          title="Task finished"
          autoContinueEnabled={autoContinueEnabled}
          nextQueueItem={nextQueueItem}
          queueTotal={queueTotal}
          showKeyHints={showKeyHints}
        />
      )}
      {showRunning && currentPrompt && (
        <RunningBanner label={currentPrompt.label} promptKey={currentPrompt.key} startedAt={currentPrompt.startedAt} />
      )}
      {isRunning && !currentPrompt && !isClosing && (
        <div className="border-t border-accent-primary/25 bg-accent-primary/[0.05] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Loader2 className="ui-spinner-sm text-accent-text shrink-0" />
            <span className="text-sm font-medium text-accent-text">Agent active</span>
            {git?.todayCount ? (
              <span className="ml-auto text-sm text-text-secondary tabular-nums">+{git.todayCount} commits today</span>
            ) : null}
          </div>
          {session?.next && (
            <p className="mt-1.5 text-xs text-text-tertiary leading-relaxed line-clamp-2">
              Next: {session.next}
            </p>
          )}
          {!session?.next && session?.done && (
            <p className="mt-1.5 text-xs text-text-tertiary leading-relaxed line-clamp-1">
              Last: {session.done}
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function InjectionHistorySection({ injections }: { injections: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  if (injections.length === 0) return null;
  return (
    <div className="border-t border-border-subtle px-4 py-2.5 sm:px-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 ui-link-muted"
      >
        <span className="font-medium">Sent today</span>
        <span className="text-text-muted/60">({injections.length})</span>
        <span className="ml-auto">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {injections.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 text-text-muted tabular-nums">
                {timeAgo(new Date(item.dispatchedAt).getTime())}
              </span>
              <span className="text-text-tertiary truncate" title={item.customPrompt ?? getIntentLabel(item.intent)}>
                {item.customPrompt
                  ? item.customPrompt.length > 60 ? item.customPrompt.slice(0, 60) + "…" : item.customPrompt
                  : getIntentLabel(item.intent)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
