/**
 * Cursor Agent adapter — `agent` CLI installed by Cursor.
 *
 * Detection is more involved than the other adapters because `agent`
 * is a generic-looking binary name and ~3 other tools on a typical
 * developer machine ship something also called `agent`. To pin it down:
 *   1. Check `agent --version` for Cursor's date-stamped format (YYYY.MM.DD).
 *   2. Fallback: check if the resolved PATH entry lives under .cursor/
 *      or .local/bin/ where Cursor's official installer drops it.
 *
 * No persistent config we read; model is selected at launch via Cursor's
 * own UI inside the CLI, not via FleetCrown's dropdown.
 */

import { execSync } from "child_process";
import { shellEscape } from "@/lib/zellij";
import { commandExistsInPath } from "./helpers";
import type { AgentAdapter, AgentAvailability, AgentRuntimeConfig } from "./types";

export const cursorAdapter: AgentAdapter = {
  id: "cursor",
  label: "Cursor",
  processMatchers: ["agent"],
  defaultModel: "auto",
  modelSuggestions: ["auto", "composer-1", "gpt-5.4", "claude-sonnet-4"],
  switchable: true,
  quitCommand: "",
  capabilities: {
    tabSwitching: true,
    manualPromptInjection: true,
    autonomousPromptLoop: false,
    sessionLifecycleSignals: false,
  },

  detectAvailable(): AgentAvailability {
    if (!commandExistsInPath("agent")) {
      return {
        available: false,
        availabilityReason: "Cursor Agent CLI is not installed. Run: curl https://cursor.com/install -fsS | bash",
      };
    }

    try {
      const version = execSync("agent --version 2>&1", { encoding: "utf-8", timeout: 3000 }).trim();
      if (/\d{4}\.\d{2}\.\d{2}/.test(version)) {
        return { available: true };
      }
    } catch {
      // Fall through — still allow if the binary's path looks like Cursor's.
    }

    const pathValue = process.env.PATH ?? "";
    for (const dir of pathValue.split(":")) {
      if (!dir) continue;
      const candidate = `${dir}/agent`;
      if (candidate.includes(".local/bin/agent") || candidate.includes(".cursor")) {
        return { available: true };
      }
    }

    return {
      available: false,
      availabilityReason: "An `agent` binary exists but does not look like Cursor Agent CLI.",
    };
  },

  readConfiguredModel(): string | null {
    return null;
  },

  buildLaunchCommand({ dir }: AgentRuntimeConfig): string {
    return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${shellEscape(dir)} && agent`;
  },
};
