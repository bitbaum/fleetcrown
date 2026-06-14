"use client";

import { Plus, RefreshCw, Radio, WifiOff, Zap } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import type { ControlDashboardState } from "./control-presenter";
import type { AutoInjectMode } from "@/config/beacon";
import { AutomationPolicyControl } from "./AutomationPolicyControl";
import {
  RUNNER_STATE_DEFINITIONS,
  deriveRunnerStateKey,
} from "@/lib/control-states";

// Single-line hint shown under the fleet chips when this mode is active.
// Binary autopilot since the 2026-06-11 collapse. Plain language only — no
// internal template names (next_best) or handoff-field jargon (status:working).
const AUTOMATION_HINTS: Record<AutoInjectMode, string> = {
  off: "Off — agents stop when a task ends; you dispatch every next step yourself.",
  on:  "On — agents work through each project's queue, then pick the next-best task automatically. Busy agents, blockers, and failing health checks still pause dispatch.",
};

type Props = {
  dashboard: ControlDashboardState | null;
  attentionCount: number;
  failedCount: number;
  runnerNeverSeen: boolean;
  runnerOffline: boolean;
  runnerStateUnknown: boolean;
  runnerLastPushedAt: string | null;
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
  lastUpdated,
  automationMode,
  automationSaving,
  refreshing,
  onRefresh,
  onAutomationChange,
  onNewProject,
  projectOverrideCount = 0,
}: Props) {
  // Vocabulary reconciled with ProjectOperationsView's rail counts
  // 2026-05-31: header now shows "X working · Y ready · Z open" matching the
  // rail exactly, with an optional "X need you" attention chip in front when
  // failed commands or attention items are present. Was: "X need you · Y
  // working · Z open" — different denominators (needsYou conflated waiting +
  // failed + attention) and different verbs from the rail's working/ready/open
  // triad. Same fact in two places now reads the same way.
  const attention = attentionCount + failedCount; // truly user-blocking
  const ready = dashboard?.waitingCount ?? 0;     // agent done, awaiting next step
  const working = dashboard?.runningCount ?? 0;
  const openTabs = dashboard?.openTabCount ?? 0;

  // SSOT: label/description/problem-CTA all come from RUNNER_STATE_DEFINITIONS
  // (lib/control-states.ts). Hand-rolled label trees that drifted between this
  // component and RunnerStatusBanner are gone — both read the same source.
  const runnerStateKey = deriveRunnerStateKey({
    neverSeen: runnerNeverSeen,
    offline: runnerOffline,
    stateUnknown: runnerStateUnknown,
  });
  const runnerDef = RUNNER_STATE_DEFINITIONS[runnerStateKey];

  const runnerDetail = !runnerNeverSeen && runnerLastPushedAt
    ? `sync ${timeAgo(new Date(runnerLastPushedAt).getTime())}`
    : lastUpdated
      ? `page ${timeAgo(lastUpdated)}`
      : null;

  const RunnerIcon = runnerStateKey === "setup_needed" || runnerStateKey === "offline" ? WifiOff : Radio;
  const runnerTone = runnerStateKey === "connected"
    ? "ui-control-fleet-runner-ok"
    : "ui-control-fleet-runner-warn";

  // Counts come from the last Fleet Runner push. When it's offline or its
  // state is uncertain, those numbers are stale — rendered as live, the user
  // assumes "1 working" means an agent is actively making progress right now.
  // Fade + a stale tooltip so the chips read as cached observations.
  const isStale = runnerOffline || runnerStateUnknown;
  const staleClass = isStale ? "opacity-60" : "";
  const staleTitle = isStale && runnerLastPushedAt
    ? `From last sync (${timeAgo(new Date(runnerLastPushedAt).getTime())}) — may be out of date`
    : isStale
      ? "Cached value — Fleet Runner hasn't pushed fresh state"
      : undefined;

  return (
    <section className="ui-control-fleet">
      <div className="ui-control-fleet-top">
        <div
          className={cn("ui-control-fleet-runner", runnerTone)}
          title={runnerDef.description}
        >
          <RunnerIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">{runnerDef.label}</span>
          {runnerDetail && <span className="text-text-muted">· {runnerDetail}</span>}
          {/* When the runner state itself signals a problem with a fix
              we know (setup_needed → install Fleet Runner), surface the
              CTA as a small action chip next to the label. Hover gives
              the longer how-to hint. */}
          {runnerDef.problem && (
            runnerDef.problem.ctaHref ? (
              <Link
                href={runnerDef.problem.ctaHref}
                className="ui-tag ui-tag-warning gap-1"
                title={runnerDef.problem.hint}
              >
                {runnerDef.problem.ctaLabel ?? "Fix"}
              </Link>
            ) : (
              <span
                className="ui-tag ui-tag-warning gap-1"
                title={runnerDef.problem.hint}
              >
                {runnerDef.problem.ctaLabel ?? "Action needed"}
              </span>
            )
          )}
        </div>
        <div className="ui-control-fleet-actions">
          <AutomationPolicyControl
            mode={automationMode}
            saving={automationSaving}
            onChange={onAutomationChange}
          />
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
          {openTabs} tab{openTabs === 1 ? "" : "s"} open
        </span>
        {attention === 0 && working === 0 && ready === 0 && openTabs === 0 && (
          <span className={cn("ui-control-fleet-chip ui-control-fleet-chip-clear", staleClass)} title={staleTitle}>
            All clear
          </span>
        )}
      </div>

      <p className="ui-control-fleet-hint">
        <Zap className="inline h-3 w-3 shrink-0 text-accent-text" aria-hidden="true" />
        {" "}
        {AUTOMATION_HINTS[automationMode]}
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
