"use client";

import { Clock, Zap } from "lucide-react";
import { agentLabel } from "@/lib/agent-resolution";

type Props = {
  /** The agent that hit the capacity wall. */
  currentAgent: string;
  /** Next available agent to switch to. */
  nextAgent: string | null;
  /** When the capacity resets, if detected from the error message. */
  resetsAt?: string;
  /** Callback to perform the agent switch. */
  onSwitch: (agent: string) => void;
};

/**
 * FleetCrown-branded capacity wall — replaces the vendor error with our own
 * messaging and a one-click switch to the next available agent.
 *
 * Shown when the terminal output contains rate-limit / quota language. Uses
 * the same AGENT_FALLBACK_ORDER and resolveNextAvailableAgent logic that
 * Control already relies on, so this is one system, not a second detector.
 */
export function TerminalCapacityBanner({ currentAgent, nextAgent, resetsAt, onSwitch }: Props) {
  const currentLabel = agentLabel(currentAgent);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="ui-card-shell-raised flex max-w-md flex-col gap-3 px-4 py-3">
        <div className="flex items-start gap-2">
          <Clock className="h-5 w-5 shrink-0 text-status-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">
              {currentLabel} has hit its capacity limit
            </p>
            {resetsAt && <p className="mt-1 text-xs text-text-secondary">Resets {resetsAt}</p>}
          </div>
        </div>

        <p className="text-xs text-text-secondary">
          You can switch to another agent to continue working now, or wait for the limit to reset.
        </p>

        {nextAgent ? (
          <button
            type="button"
            className="ui-btn-primary ui-btn-xs flex items-center gap-2"
            onClick={() => onSwitch(nextAgent)}
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Switch to {agentLabel(nextAgent)}
          </button>
        ) : (
          <p className="text-xs text-status-warning">
            All available agents have reached their limits. Try again after the reset time.
          </p>
        )}
      </div>
    </div>
  );
}
