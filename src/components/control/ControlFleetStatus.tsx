"use client";

import Link from "next/link";
import { Plus, RefreshCw, Radio, WifiOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import type { ControlDashboardState, FleetPulse } from "./control-presenter";
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
  builderVersions?: { cloud: string | null; local: string | null } | null;
  builderPresence?: BuilderChannelPresence | null;
  runnerExecutionStall: { stalled: boolean; stalledCount: number; oldestSeconds: number } | null;
  lastUpdated: number | null;
  automationMode: AutoInjectMode;
  /** False until /api/beacon-settings answers — the hint must not assert
   *  "Autopilot on" from an optimistic client-side default. */
  automationModeLoaded?: boolean;
  /** Truthful hero headline — deriveFleetPulse(), computed by ControlPanel. */
  fleetPulse: FleetPulse;
  automationSaving: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onAutomationChange: (mode: AutoInjectMode) => void;
  /** Opens the new-project flow. Lives here (next to refresh) so the page
   *  needs no separate header row for a single button. */
  onNewProject?: () => void;
  /** Makes the working/awaiting-input counter chips actionable: selects the
   *  first project in that bucket and scrolls the workspace into view. A
   *  count you can't follow to its subject is noise, not status. */
  onFocusCategory?: (category: "working" | "waiting") => void;
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
  builderVersions,
  builderPresence,
  runnerExecutionStall,
  lastUpdated,
  automationMode,
  automationModeLoaded = true,
  fleetPulse,
  automationSaving,
  refreshing,
  onRefresh,
  onAutomationChange,
  onNewProject,
  onFocusCategory,
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
  // Append the connected builders' reported versions so the user can confirm
  // which builds are live (helps diagnose stale-runner bugs). Per channel:
  // two builders can be online at once, and collapsing them to one string
  // rendered whichever pushed last — the hero flipped between "builder
  // vbox-0.8.9" and the semver-shaped lie "vdev". A genuine dev build is
  // labeled honestly instead of dressed up as a version number.
  const fmtVersion = (v: string) => (v === "dev" ? "dev build" : `v${v.replace(/^box-/, "")}`);
  const versionDetail = runnerStateKey === "connected"
    ? [
        builderVersions?.cloud ? `cloud ${fmtVersion(builderVersions.cloud)}` : null,
        builderVersions?.local ? `app ${fmtVersion(builderVersions.local)}` : null,
      ].filter(Boolean).join(" · ")
      || (runnerVersion ? `${EXECUTOR_COPY.builder.versionPrefix} ${fmtVersion(runnerVersion)}` : null)
    : null;
  const compactLabel = builderCompactLabel(runnerStateKey, runnerVersion, builderPresence);
  const presenceDetail = builderPresence && runnerStateKey === "connected"
    ? builderPresenceDetail(builderPresence)
    : null;
  const runnerDetail = [syncDetail, versionDetail, presenceDetail].filter(Boolean).join(" · ") || null;

  const RunnerIcon = runnerStateKey === "setup_needed" || runnerStateKey === "offline" ? WifiOff : Radio;
  // A connected runner with a genuine execution stall must not read plain
  // green: "online · sync just now" is the push channel, and it being healthy
  // is exactly how a hung command loop masquerades as fine. The pulse below
  // carries the full stall story; this line just stops contradicting it.
  const executionStalled = Boolean(runnerExecutionStall?.stalled);
  const runnerTone = runnerStateKey === "connected" && !executionStalled
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
          {executionStalled && <span className="font-medium">· not executing</span>}
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
          {/* Headline = what the fleet is ACTUALLY doing (deriveFleetPulse),
              not what the mode toggle wishes. "Building" + pulsing green once
              rendered over a fleet whose every recent run had failed. */}
          <p className="ui-control-autopilot-state">
            {fleetPulse.key === "building" && (
              <span className="ui-dot ui-dot-positive animate-pulse shrink-0" aria-hidden="true" />
            )}
            {fleetPulse.key === "waiting" && (
              <span className="ui-dot ui-dot-neutral shrink-0" aria-hidden="true" />
            )}
            {(fleetPulse.key === "failing" || fleetPulse.key === "stalled") && (
              <span className="ui-dot ui-dot-negative shrink-0" aria-hidden="true" />
            )}
            <span className="font-medium text-text-primary">{fleetPulse.label}</span>
            {fleetPulse.key === "building" && working > 0 && (
              <span className="text-text-muted">
                · {working} agent{working === 1 ? "" : "s"} active
              </span>
            )}
          </p>
          {fleetPulse.detail && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Red is for problems. "Waiting on you" is a normal state — a
                  red sentence under a neutral dot read as a contradiction. */}
              <p className={cn(
                "text-xs",
                fleetPulse.key === "failing" || fleetPulse.key === "stalled"
                  ? "text-status-negative"
                  : "text-text-muted",
              )}>{fleetPulse.detail}</p>
              {/* When the fleet is failing, reviewing the failures IS the next
                  action — it gets a real button. For an execution stall the
                  detail already names the stuck projects; /activity has
                  nothing to add, so no misleading link. */}
              {fleetPulse.key === "failing" && (
                <Link href="/activity?window=week" className="ui-btn-secondary shrink-0 px-2.5 py-1 text-xs">
                  Review failures
                </Link>
              )}
            </div>
          )}
        </div>
        <AutomationPolicyControl
          mode={automationMode}
          saving={automationSaving}
          onChange={onAutomationChange}
          variant="hero"
        />
      </div>

      {/* The execution-stall story lives in the fleet pulse above ("Stalled —
          N dispatches queued for Xm (projects)…"). The separate alert chip here
          duplicated it one line lower — and before the pulse knew about
          stalls, the two contradicted each other ("Building" + "not
          executing" on adjacent lines). */}

      <div className="ui-control-fleet-metrics">
        {attention > 0 && (
          <button
            type="button"
            onClick={() => document.getElementById("control-attention")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={cn("ui-control-fleet-chip ui-control-fleet-chip-attention cursor-pointer transition-opacity hover:opacity-80", staleClass)}
            title={staleTitle ?? "Failed commands and projects waiting on you — click to jump to the list"}
          >
            {attention} need{attention === 1 ? "s" : ""} you
          </button>
        )}
        {working > 0 && onFocusCategory ? (
          <button
            type="button"
            onClick={() => onFocusCategory("working")}
            className={cn("ui-control-fleet-chip cursor-pointer transition-opacity hover:opacity-80", staleClass)}
            title={staleTitle ?? "Jump to the working project"}
          >
            <span className="ui-dot ui-dot-positive shrink-0 mr-1" aria-hidden="true" />
            {working} working
          </button>
        ) : (
          <span className={cn("ui-control-fleet-chip", staleClass)} title={staleTitle}>
            {working > 0 && <span className="ui-dot ui-dot-positive shrink-0 mr-1" aria-hidden="true" />}
            {working} working
          </span>
        )}
        {ready > 0 && onFocusCategory ? (
          <button
            type="button"
            onClick={() => onFocusCategory("waiting")}
            className={cn("ui-control-fleet-chip cursor-pointer transition-opacity hover:opacity-80", staleClass)}
            title={staleTitle ?? "Jump to the project waiting on you"}
          >
            {ready} awaiting input
          </button>
        ) : (
          <span className={cn("ui-control-fleet-chip", staleClass)} title={staleTitle}>
            {ready} awaiting input
          </span>
        )}
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
        {/* Don't state the autopilot mode until the server has confirmed it —
            the client seeds "on" optimistically, so a paused fleet used to
            read "Autopilot on" until (or forever, if the fetch failed). */}
        {automationModeLoaded
          ? AUTOMATION_HINTS[automationMode].primary
          : "Checking autopilot setting…"}
        {automationModeLoaded && AUTOMATION_HINTS[automationMode].secondary && (
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
