"use client";

import { RefreshCw, Radio, WifiOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";
import type { ControlDashboardState } from "./control-presenter";
import type { AutoInjectMode } from "@/config/beacon";
import { AutomationPolicyControl } from "./AutomationPolicyControl";

const AUTOMATION_HINT: Record<AutoInjectMode, string> = {
  off: "Agents stop when a task ends — you send every next step.",
  queue_only: "Agents continue only when queued instructions exist.",
  strategist: "Agents keep working when you are away — you step in for exceptions.",
  next_best: "Agents auto-run a canned next step when a task ends.",
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
  const needsYou = attentionCount + failedCount + (dashboard?.waitingCount ?? 0);
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

      <div className="ui-control-fleet-metrics">
        {needsYou > 0 ? (
          <span className="ui-control-fleet-chip ui-control-fleet-chip-attention">
            {needsYou} need{needsYou === 1 ? "s" : ""} you
          </span>
        ) : (
          <span className="ui-control-fleet-chip ui-control-fleet-chip-clear">
            All clear
          </span>
        )}
        {working > 0 && (
          <span className="ui-control-fleet-chip">
            <span className="ui-dot ui-dot-positive shrink-0" aria-hidden="true" />
            {working} working
          </span>
        )}
        {openTabs > 0 && (
          <span className="ui-control-fleet-chip">{openTabs} open</span>
        )}
      </div>

      <p className="ui-control-fleet-hint">
        <Zap className="inline h-3 w-3 shrink-0 text-accent-text" aria-hidden="true" />
        {" "}
        {AUTOMATION_HINT[automationMode]}
      </p>
    </section>
  );
}
