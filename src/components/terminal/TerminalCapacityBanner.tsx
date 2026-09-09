"use client";

import { Clock, AlertTriangle, Loader2 } from "lucide-react";
import { agentLabel } from "@/lib/agent-resolution";
import { AGENT_FALLBACK_ORDER } from "@/lib/agent-resolution";
import { cn } from "@/lib/utils";

export type AgentAvailability = {
  id: string;
  label: string;
  available: boolean;
  availabilityReason?: string;
};

type Props = {
  /** The agent that hit the capacity wall. */
  currentAgent: string;
  /** All agents in fallback order with their availability status. */
  agents: AgentAvailability[];
  /** When the capacity resets, if detected from the error message. */
  resetsAt?: string;
  /** Callback to perform the agent switch. */
  onSwitch: (agent: string) => void;
  /** True while a switch is in progress. */
  switching?: boolean;
};

/**
 * Terminal capacity overlay — replaces the vendor error with FleetCrown's own
 * capacity handling UI.
 *
 * Shows the full agent fallback chain with availability, allows switching to
 * any available agent. Uses AGENT_FALLBACK_ORDER from the registry, not a
 * hardcoded list.
 */
export function TerminalCapacityBanner({
  currentAgent,
  agents,
  resetsAt,
  onSwitch,
  switching = false,
}: Props) {
  const currentLabel = agentLabel(currentAgent);
  
  // Filter to agents in the fallback order that are available
  const fallbackAgents = AGENT_FALLBACK_ORDER.map((id) => agents.find((a) => a.id === id)).filter(
    (a): a is AgentAvailability => a !== undefined,
  );

  const currentIndex = fallbackAgents.findIndex((a) => a.id === currentAgent);
  const remaining = fallbackAgents.slice(currentIndex + 1);
  const availableRemaining = remaining.filter((a) => a.available);
  const allExhausted = availableRemaining.length === 0;

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="ui-card-shell-raised flex w-full max-w-md flex-col gap-3 px-4 py-3">
        {/* Header */}
        <div className="flex items-start gap-2">
          {allExhausted ? (
            <AlertTriangle className="h-5 w-5 shrink-0 text-status-warning" aria-hidden="true" />
          ) : (
            <Clock className="h-5 w-5 shrink-0 text-status-warning" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">
              {currentLabel} has hit its capacity limit
            </p>
            {resetsAt && <p className="mt-1 text-xs text-text-secondary">Resets {resetsAt}</p>}
          </div>
        </div>

        {/* Fallback chain */}
        {allExhausted ? (
          <p className="text-xs text-status-warning">
            All available agents have reached their limits. Wait for the reset time or install
            additional agents.
          </p>
        ) : (
          <>
            <p className="text-xs text-text-secondary">
              Switch to another agent to continue working now:
            </p>

            <div className="flex flex-wrap gap-2">
              {remaining.map((agent) => {
                const unavailable = !agent.available;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    disabled={unavailable || switching}
                    title={unavailable ? agent.availabilityReason : undefined}
                    onClick={() => onSwitch(agent.id)}
                    className={cn(
                      "ui-chip-toggle inline-flex items-center gap-1.5 text-xs",
                      unavailable && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {switching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {agent.label}
                  </button>
                );
              })}
            </div>

            {remaining.some((a) => !a.available) && (
              <p className="text-micro text-text-muted">
                Unavailable agents are shown disabled — install them to use as fallbacks.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
