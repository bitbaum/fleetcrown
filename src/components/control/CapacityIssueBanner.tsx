"use client";

import { Loader2, Repeat2 } from "lucide-react";
import { agentLabel } from "@/lib/agent-resolution";

export function CapacityIssueBanner({
  currentAgentId,
  nextAgentId,
  switching,
  auto,
  exhausted,
  onSwitch,
  onDismiss,
}: {
  currentAgentId: string;
  nextAgentId: string;
  switching?: boolean;
  /** Autopilot is handling the switch itself — render a status note, no buttons. */
  auto?: boolean;
  /** Every installed fallback was auto-tried this episode — a human is needed. */
  exhausted?: boolean;
  onSwitch: () => void;
  onDismiss?: () => void;
}) {
  if (auto) {
    return (
      <div className="mx-4 mb-3 rounded-xl border border-status-warning/40 bg-status-warning/[0.06] px-4 py-3 sm:mx-5 md:mx-6">
        <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-status-warning" />
          {agentLabel(currentAgentId)} hit a capacity limit — autopilot is switching to{" "}
          {agentLabel(nextAgentId)}…
        </p>
      </div>
    );
  }
  return (
    <div className="mx-4 mb-3 rounded-xl border border-status-warning/40 bg-status-warning/[0.06] px-4 py-3 sm:mx-5 md:mx-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-text-primary">
            {agentLabel(currentAgentId)} hit a capacity limit
          </p>
          <p className="text-xs text-text-secondary">
            {exhausted
              ? `Autopilot tried every installed agent and all hit limits. Switch to ${agentLabel(nextAgentId)} to retry, or wait for capacity to recover.`
              : `Switch to ${agentLabel(nextAgentId)} and keep going — no terminal commands needed.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              Dismiss
            </button>
          )}
          <button
            type="button"
            onClick={onSwitch}
            disabled={switching}
            className="ui-btn-secondary gap-2 text-xs disabled:opacity-60"
          >
            {switching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Switching…
              </>
            ) : (
              <>
                <Repeat2 className="h-3.5 w-3.5" />
                Switch to {agentLabel(nextAgentId)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
