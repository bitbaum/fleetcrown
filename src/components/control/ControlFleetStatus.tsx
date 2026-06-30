"use client";

import { Plus, RefreshCw, Radio, WifiOff, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import type { ControlDashboardState } from "./control-presenter";
import type { AutoInjectMode } from "@/config/beacon";
import { AutomationPolicyControl } from "./AutomationPolicyControl";
import {
  RUNNER_STATE_DEFINITIONS,
  deriveRunnerStateKey,
} from "@/lib/control-states";
import { builderCompactLabel, builderPresenceDetail } from "@/lib/builder-presence";
import type { BuilderChannelPresence } from "@/lib/builder-presence";
import { EXECUTOR_COPY } from "@/config/executor-copy";

// Single-line hint shown under the fleet chips when this mode is active.
// Binary autopilot since the 2026-06-11 collapse. Plain language only — no
// internal template names (next_best) or handoff-field jargon (status:working).
// Split into primary + secondary so the space-constrained mobile card shows
// only the essential sentence; the caveat rides along on sm+ where there's room.
const AUTOMATION_HINTS: Record<AutoInjectMode, { primary: string; secondary?: string }> = {
  off: { primary: "Autopilot off — agents stop when a task ends; you dispatch every next step yourself." },
  on:  {
    primary: "Autopilot on — agents work through each project's queue, then pick the next-best task automatically.",
    secondary: "Busy agents, blockers, and failing health checks still pause dispatch.",
  },
};

type Props = {
  dashboard: ControlDashboardState | null;
  attentionCount: number;
  failedCount: number;
  runnerNeverSeen: boolean;
  runnerOffline: boolean;
  runnerStateUnknown: boolean;
  runnerLastPushedAt: string | null;
  runnerVersion?: string | null;
  builderPresence?: BuilderChannelPresence | null;
  runnerExecutionStall: { stalled: boolean; stalledCount: number; oldestSeconds: number } | null;
  lastUpdated: number | null;
  automationMode: AutoInjectMode;
  automationSaving: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onAutomationChange: (mode: AutoInjectMode) => void;
  /** Opens the new-project flow. Lives here (next to refresh) so the page
   *  needs no separate header row for a single button. */
  onNewProject?: () => void;
  projectOverrideCount?: number;
};

/** Fleet pulse + trust layer — the first thing you see on Control (especially mobile). */
export function ControlFleetStatus({
  dashboard,
  attentionCount,
  failedCount,
  runnerNeverSeen,
  runnerOffline,
  runnerStateUnknown,
  runnerLastPushedAt,
  runnerVersion,
  builderPresence,
  runnerExecutionStall,
  lastUpdated,
  automationMode,
  automationSaving,
  refreshing,
  onRefresh,
  onAutomationChange,
  onNewProject,
  projectOverrideCount = 0,
}: Props) {
  // Vocabulary AND arithmetic reconciled with ProjectOperationsView's rail.
  // The triad is "X working · Y awaiting input · Z idle" — three
  // mutually-exclusive buckets, every project in exactly one, all sourced from
  // buildControlPageState's counterCategory tally (the same SSOT the rail
  // reads). The third chip used to be openTabCount ("Z tabs open"), a SUPERSET
  // that re-counted the working/awaiting projects whose tabs were also open —
  // so "1 working · … · 1 tabs open" described the SAME project twice and
  // disagreed with the rail's "0 idle". Now header and rail show identical
  // numbers. An optional "X need you" attention chip leads when there are
  // failed commands or attention items.
  const attention = attentionCount + failedCount; // truly user-blocking
  const ready = dashboard?.waitingCount ?? 0;     // agent done, awaiting next step
  const working = dashboard?.runningCount ?? 0;
  const idle = dashboard?.idleCount ?? 0;         // inert: not_running / tab_open / closing / completed

  // SSOT: label/description/problem-CTA all come from RUNNER_STATE_DEFINITIONS
  // (lib/control-states.ts). Hand-rolled label trees that drifted between this
  // component and RunnerStatusBanner are gone — both read the same source.
  const runnerStateKey = deriveRunnerStateKey({
    neverSeen: runnerNeverSeen,
    offline: runnerOffline,
    stateUnknown: runnerStateUnknown,
  });
  const runnerDef = RUNNER_STATE_DEFINITIONS[runnerStateKey];

  const syncDetail = !runnerNeverSeen && runnerLastPushedAt
    ? `sync ${timeAgo(new Date(runnerLastPushedAt).getTime())}`
    : lastUpdated
      ? `page ${timeAgo(lastUpdated)}`
      : null;
  // Append the connected runner's reported version so the user can confirm
  // which Fleet Runner build is live (helps diagnose stale-runner bugs).
  const versionDetail = runnerStateKey === "connected" && runnerVersion
    ? `${EXECUTOR_COPY.builder.versionPrefix} v${runnerVersion}`
    : null;
  const compactLabel = builderCompactLabel(runnerStateKey, runnerVersion, builderPresence);
  const presenceDetail = builderPresence && runnerStateKey === "connected"
    ? builderPresenceDetail(builderPresence)
    : null;
  const runnerDetail = [syncDetail, versionDetail, presenceDetail].filter(Boolean).join(" · ") || null;

  const RunnerIcon = runnerStateKey === "setup_needed" || runnerStateKey === "offline" ? WifiOff : Radio;
  const runnerTone = runnerStateKey === "connected"
    ? "ui-control-fleet-runner-ok"
    : "ui-control-fleet-runner-warn";

  // Compact status word for this header card. The full headline + the
  // "commands queue until it reconnects" explanation + the remediation CTA
  // all live in RunnerStatusBanner (the single prominent alert). Here we only
  // need a glanceable indicator — dot + word + sync timestamp — so the offline
  // story isn't told three times across the page. runnerDef.description still
  // rides along as the hover tooltip for the curious.
  const isStale = runnerOffline || runnerStateUnknown;
  const staleClass = isStale ? "opacity-60" : "";
  const staleTitle = isStale && runnerLastPushedAt
    ? `From last sync (${timeAgo(new Date(runnerLastPushedAt).getTime())}) — may be out of date`
    : isStale
      ? EXECUTOR_COPY.builder.staleSync
      : undefined;

  return (
    <section className="ui-control-hero">
      <div className="ui-control-fleet-top">
        {/* Compact status indicator only. The prominent offline explanation +
            remediation lives once, in RunnerStatusBanner — this header must not
            repeat the headline, the "commands queue" sentence, or a second
            "Action needed" nudge. */}
        <div
          className={cn("ui-control-fleet-runner", runnerTone)}
          title={runnerDef.description}
        >
          <RunnerIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">{compactLabel}</span>
          {runnerDetail && <span className="text-text-muted">· {runnerDetail}</span>}
        </div>
        <div className="ui-control-fleet-actions">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh fleet state"
            aria-label="Refresh fleet state"
            className="ui-icon-btn-touch rounded p-1 text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
          {onNewProject && (
            <button
              type="button"
              onClick={onNewProject}
              title="New project"
              className="ui-icon-btn-touch inline-flex items-center gap-1 rounded p-1 text-text-tertiary transition-colors hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">New</span>
            </button>
          )}
        </div>
      </div>

      <div className="ui-control-hero-autopilot">
        <div className="ui-control-autopilot-status">
          <p className="ui-control-autopilot-title">Fleet autopilot</p>
          <p className="ui-control-autopilot-state">
            {automationMode === "on" && (
              <span className="ui-dot ui-dot-positive animate-pulse shrink-0" aria-hidden="true" />
            )}
            <span className="font-medium text-text-primary">
              {automationMode === "on" ? "Building" : "Paused"}
            </span>
            {automationMode === "on" && working > 0 && (
              <span className="text-text-muted">
                · {working} agent{working === 1 ? "" : "s"} active
              </span>
            )}
          </p>
        </div>
        <AutomationPolicyControl
          mode={automationMode}
          saving={automationSaving}
          onChange={onAutomationChange}
          variant="hero"
        />
      </div>

      {runnerExecutionStall?.stalled && (
        <div
          className="ui-control-fleet-chip ui-control-fleet-chip-attention ui-control-fleet-chip-alert"
          role="alert"
          title={EXECUTOR_COPY.builder.stalledDetail(
            runnerExecutionStall.stalledCount,
            runnerExecutionStall.oldestSeconds,
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="sm:hidden">
            {EXECUTOR_COPY.builder.stalledShort(runnerExecutionStall.stalledCount)}
          </span>
          <span className="hidden sm:inline">
            {EXECUTOR_COPY.builder.stalledDetail(
              runnerExecutionStall.stalledCount,
              runnerExecutionStall.oldestSeconds,
            )}
          </span>
        </div>
      )}

      <div className="ui-control-fleet-metrics">
        {attention > 0 && (
          <span className={cn("ui-control-fleet-chip ui-control-fleet-chip-attention", staleClass)} title={staleTitle}>
            {attention} need{attention === 1 ? "s" : ""} you
          </span>
        )}
        <span className={cn("ui-control-fleet-chip", staleClass)} title={staleTitle}>
          {working > 0 && <span className="ui-dot ui-dot-positive shrink-0 mr-1" aria-hidden="true" />}
          {working} working
        </span>
        <span className={cn("ui-control-fleet-chip", staleClass)} title={staleTitle}>
          {ready} awaiting input
        </span>
        <span className={cn("ui-control-fleet-chip", staleClass)} title={staleTitle}>
          {idle} idle
        </span>
        {/* "All clear" only when nothing needs you and nothing is live — and
            never while stale, when 0/0/0 means "the runner stopped reporting",
            not "the fleet is calm". */}
        {!isStale && attention === 0 && working === 0 && ready === 0 && idle === 0 && (
          <span className={cn("ui-control-fleet-chip ui-control-fleet-chip-clear", staleClass)} title={staleTitle}>
            All clear
          </span>
        )}
      </div>

      <p className="ui-control-fleet-hint">
        <Zap className="inline h-3 w-3 shrink-0 text-accent-text" aria-hidden="true" />
        {" "}
        {AUTOMATION_HINTS[automationMode].primary}
        {AUTOMATION_HINTS[automationMode].secondary && (
          <span className="hidden sm:inline"> {AUTOMATION_HINTS[automationMode].secondary}</span>
        )}
        {projectOverrideCount > 0 && (
          <span className="ml-1 text-accent-text">
            {projectOverrideCount === 1
              ? "1 project uses its own autopilot setting."
              : `${projectOverrideCount} projects use their own autopilot settings.`}
          </span>
        )}
      </p>
    </section>
  );
}
