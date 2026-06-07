/**
 * OpenClaw adapter — the FleetCrown-bundled gateway agent.
 *
 * OpenClaw is FleetCrown's own minimal-cost meta-agent: it doesn't
 * accept interactive prompts via FleetCrown (no tab switching, no
 * manual injection). It's exposed in the agent list mostly so the UI
 * can show "OpenClaw is/isn't installed" diagnostic info — the actual
 * dispatch path is the Brain → next-best fallback, not a CLI launch.
 *
 * `switchable: false` keeps it out of the agent-switcher UI; users
 * don't pick OpenClaw, the system picks it as a fallback.
 */

import path from "path";
import { existsSync } from "fs";
import { HOME } from "@/lib/constants";
import { shellEscape } from "@/lib/zellij";
import { commandExistsInPath } from "./helpers";
import type { AgentAdapter, AgentAvailability, AgentRuntimeConfig } from "./types";

export const openclawAdapter: AgentAdapter = {
  id: "openclaw",
  label: "OpenClaw",
  processMatchers: ["openclaw"],
  defaultModel: "gateway-default",
  modelSuggestions: ["gateway-default"],
  switchable: false,
  quitCommand: "q",
  capabilities: {
    tabSwitching: false,
    manualPromptInjection: false,
    autonomousPromptLoop: false,
    sessionLifecycleSignals: false,
  },

  detectAvailable(): AgentAvailability {
    if (commandExistsInPath("openclaw")) return { available: true };
    if (existsSync(path.join(HOME, "openclaw", "openclaw.mjs"))) {
      return {
        available: false,
        availabilityReason: "OpenClaw source is present, but the `openclaw` CLI is not installed on PATH.",
      };
    }
    return {
      available: false,
      availabilityReason: "OpenClaw CLI is not installed on this machine.",
    };
  },

  readConfiguredModel(): string | null {
    return null;
  },

  buildLaunchCommand({ dir }: AgentRuntimeConfig): string {
    return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${shellEscape(dir)} && openclaw tui`;
  },
};
