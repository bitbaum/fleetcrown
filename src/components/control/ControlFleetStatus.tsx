"use client";

import { RefreshCw, Radio, WifiOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import type { ControlDashboardState } from "./control-presenter";
import type { AutoInjectMode } from "@/config/beacon";
import { AutomationPolicyControl } from "./AutomationPolicyControl";

// Single-line hint shown under the fleet chips when this mode is active.
// Five-level trust ladder (2026-05-31): Manual / Queue / Beacon / Continuous / Mission.
const AUTOMATION_HINT: Record<AutoInjectMode, string> = {
  off: "Manual — agents stop when a task ends; you dispatch every next step.",
  queue_only: "Queue — agents drain your written queue, then stop.",
  beacon: "Beacon — popup with smart choices on every handoff; countdown auto-picks if you're away.",
  next_best: "Continuous — agents auto-run the canned next-best step on every handoff.",
  strategist: "Mission — FleetCrown composes context-aware prompts from project mission, goals, and history.",
};

type Props = {
  dashboard: ControlDashboardState | null;
  attentionCount: number;
  failedCount: number;
  daemonNeverSeen: boolean;
  daemonOffline: boolean;
  daemonStateUnknown: boolean;
  daemonLastPushedAt: string | null;
  lastUpdated: number | null;
  automationMode: AutoInjectMode;
  automationSaving: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onAutomationChange: (mode: AutoInjectMode) => void;
};

/** Fleet pulse + trust layer — the first thing you see on Control (especially mobile). */
export function ControlFleetStatus({
  dashboard,
  attentionCount,
  failedCount,
  daemonNeverSeen,
  daemonOffline,
  daemonStateUnknown,
  daemonLastPushedAt,
  lastUpdated,
  automationMode,
  automationSaving,
  refreshing,
  onRefresh,
  onAutomationChange,
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

  const daemonLabel = daemonNeverSeen
    ? "Setup needed"
    : daemonOffline
      ? "Daemon offline"
      : daemonStateUnknown
        ? "Status uncertain"
        : "Connected";

  const daemonDetail = !daemonNeverSeen && daemonLastPushedAt
    ? `sync ${timeAgo(new Date(daemonLastPushedAt).getTime())}`
    : lastUpdated
      ? `page ${timeAgo(lastUpdated)}`
      : null;

  const DaemonIcon = daemonNeverSeen || daemonOffline ? WifiOff : Radio;
  const daemonTone = daemonNeverSeen || daemonOffline || daemonStateUnknown
    ? "ui-control-fleet-daemon-warn"
    : "ui-control-fleet-daemon-ok";

  return (
    <section className="ui-control-fleet">
      <div className="ui-control-fleet-top">
        <div className={cn("ui-control-fleet-daemon", daemonTone)}>
          <DaemonIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">{daemonLabel}</span>
          {daemonDetail && <span className="text-text-muted">· {daemonDetail}</span>}
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
        </div>
      </div>

      {(() => {
        // Counts are extracted from the last daemon push. When the daemon is
        // offline or its state is uncertain, those numbers are stale — but
        // rendered as live, the user assumes "1 working" means an agent is
        // actively making progress right now. Audit caught this live:
        // "Daemon offline · sync 2m ago" header but "1 working" + green dot
        // in the chip row reading as live. Fade + a stale tooltip so the chip
        // reads as cached observation when sync isn't fresh.
        const isStale = daemonOffline || daemonStateUnknown;
        const staleClass = isStale ? "opacity-60" : "";
        const staleTitle = isStale && daemonLastPushedAt
          ? `From last daemon sync (${timeAgo(new Date(daemonLastPushedAt).getTime())}) — may be out of date`
          : isStale
            ? "Cached value — daemon hasn't pushed fresh state"
            : undefined;
        return (
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
              {ready} ready
            </span>
            <span className={cn("ui-control-fleet-chip", staleClass)} title={staleTitle}>
              {openTabs} open
            </span>
            {attention === 0 && working === 0 && ready === 0 && openTabs === 0 && (
              <span className={cn("ui-control-fleet-chip ui-control-fleet-chip-clear", staleClass)} title={staleTitle}>
                All clear
              </span>
            )}
          </div>
        );
      })()}

      <p className="ui-control-fleet-hint">
        <Zap className="inline h-3 w-3 shrink-0 text-accent-text" aria-hidden="true" />
        {" "}
        {AUTOMATION_HINT[automationMode]}
      </p>
    </section>
  );
}
