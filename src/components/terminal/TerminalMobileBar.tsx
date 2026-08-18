"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TERMINAL_INPUT_MODES,
  TERMINAL_SOURCES,
  terminalInputHint,
  type TerminalInputMode,
  type TerminalSource,
} from "@/config/terminal-modes";
import { AgentSwitcherPopover, type AgentEntry } from "@/components/control/agent-switcher-popover";
import { ExecutorHonestyChip } from "@/components/executor/ExecutorHonestyChip";
import type { ExecutorHonestyLabel } from "@/lib/executor-honesty";

/**
 * Every terminal control a phone needs, in two rows.
 *
 * The desktop chrome is five stacked blocks — expand hint, source segment, tab
 * strip, deep-link notice, session bar with its own hint paragraph — and it
 * stacks the same way on a phone. Measured on a 390×844 device: 331px of
 * controls above a terminal that got 4 visible lines, with a link bar below
 * taking another 190px. The controls were bigger than the thing they control.
 *
 * The fix is not smaller chrome, it is fewer rows. Three of those blocks are
 * one-of-N choices, and a phone already has an excellent one-of-N control that
 * costs a single row and opens into the system picker: `<select>`. Segmented
 * chip rows are a desktop idiom that survives on a phone only by wrapping.
 *
 * Agent stays a button, not a select. Switching agent quits the running CLI and
 * relaunches — a destructive action deserves the two-tap popover it has on
 * desktop, not a wheel a thumb can graze.
 */
export function TerminalMobileBar({
  source,
  sources,
  onSourceChange,
  tabs,
  activeTab = null,
  onSelectTab,
  inputMode,
  onInputModeChange,
  agents,
  activeAgentId,
  onSwitchAgent,
  switchingAgent,
  agentSwitchDisabledReason,
  honesty,
  immersive,
  onToggleImmersive,
}: {
  source: TerminalSource;
  sources: TerminalSource[];
  onSourceChange: (source: TerminalSource) => void;
  /** Omitted for the shell substrate, which owns its own tabs and splits. */
  tabs?: { id: string; label: string; badge?: string }[];
  activeTab?: string | null;
  onSelectTab?: (id: string) => void;
  inputMode: TerminalInputMode;
  onInputModeChange: (mode: TerminalInputMode) => void;
  agents: AgentEntry[];
  activeAgentId: string | null;
  onSwitchAgent: (agentId: string) => void;
  switchingAgent: boolean;
  agentSwitchDisabledReason: string | null;
  honesty: ExecutorHonestyLabel | null;
  immersive: boolean;
  onToggleImmersive: () => void;
}) {
  const [agentOpen, setAgentOpen] = useState(false);
  const sourceOptions = TERMINAL_SOURCES.filter((s) => sources.includes(s.id));
  const activeAgent = agents.find((a) => a.id === activeAgentId);
  const agentLabel = activeAgent?.label ?? "Agent";
  const canSwitchAgent = agents.length > 0 && !agentSwitchDisabledReason;

  return (
    <div className="ui-term-mbar md:hidden">
      <div className="ui-term-mbar-row">
        <select
          className="ui-term-mbar-select"
          value={source}
          onChange={(e) => onSourceChange(e.target.value as TerminalSource)}
          aria-label="Terminal source"
        >
          {sourceOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>

        {tabs && onSelectTab && (
          <select
            className="ui-term-mbar-select ui-term-mbar-select-grow"
            value={activeTab ?? ""}
            onChange={(e) => onSelectTab(e.target.value)}
            disabled={tabs.length === 0}
            aria-label="Session"
          >
            {tabs.length === 0 && <option value="">No sessions</option>}
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.badge ? `${tab.label} · ${tab.badge}` : tab.label}
              </option>
            ))}
          </select>
        )}
        {!tabs && <span className="ui-term-mbar-spacer" />}

        <button
          type="button"
          className="ui-term-mbar-btn"
          onClick={onToggleImmersive}
          aria-pressed={immersive}
          aria-label={immersive ? "Exit full screen terminal" : "Expand terminal to full screen"}
        >
          {immersive
            ? <Minimize2 className="h-4 w-4" aria-hidden="true" />
            : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      {activeTab && tabs && (
        <div className="ui-term-mbar-row">
          <div className="relative">
            <button
              type="button"
              onClick={() => canSwitchAgent && setAgentOpen((open) => !open)}
              disabled={!canSwitchAgent || switchingAgent}
              title={agentSwitchDisabledReason ?? "Switch the agent running in this tab"}
              aria-haspopup="menu"
              aria-expanded={agentOpen}
              className={cn("ui-term-mbar-btn gap-1 px-3", !canSwitchAgent && "opacity-50")}
            >
              {switchingAgent ? <Loader2 className="ui-spinner-sm" /> : null}
              {agentLabel}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {agentOpen && (
              <AgentSwitcherPopover
                agents={agents}
                activeAgentId={activeAgentId ?? ""}
                onSwitch={(id) => { if (id) onSwitchAgent(id); }}
                onClose={() => setAgentOpen(false)}
              />
            )}
          </div>

          <select
            className="ui-term-mbar-select"
            value={inputMode}
            onChange={(e) => onInputModeChange(e.target.value as TerminalInputMode)}
            aria-label="Input mode"
            title={terminalInputHint(inputMode)}
          >
            {TERMINAL_INPUT_MODES.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>

          <ExecutorHonestyChip honesty={honesty} />
        </div>
      )}

      {/* The consequence line, but only where it is news. "Type" is the default
          and behaves the way a terminal already looks like it behaves; spending
          two lines of a phone screen to say so is what made this bar tall. */}
      {activeTab && tabs && inputMode !== "type" && (
        <p className="text-micro leading-snug text-text-muted">{terminalInputHint(inputMode)}</p>
      )}
    </div>
  );
}
