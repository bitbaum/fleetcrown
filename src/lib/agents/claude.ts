/**
 * Claude Code adapter — Anthropic's `claude` CLI.
 *
 * Claude is the default agent + the one with the most FleetCrown
 * integration: hooks-based activity tracking, session.md handoffs, full
 * lifecycle signals. The capability flags reflect that — `claude` is
 * the reference implementation every other adapter is measured against.
 *
 * Two distinct config locations on disk:
 *   - ~/.claude/settings.json    (the canonical one Claude reads)
 *   - ~/dev/dotfiles/.claude/... (some user setups symlink instead)
 * `readConfiguredModel` checks both; `syncSelectedModel` writes only to
 * the canonical one (the symlink target picks it up automatically).
 */

import fs from "fs";
import path from "path";
import { HOME } from "@/lib/constants";
import { shellEscape } from "@/lib/zellij";
import type { AgentAdapter, AgentAvailability, AgentRuntimeConfig } from "./types";

const SETTINGS_FILE = path.join(HOME, ".claude", "settings.json");
const DOTFILES_SETTINGS_FILE = path.join(HOME, "dev", "dotfiles", ".claude", "settings.json");

function readModelFromSettings(file: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { model?: unknown };
    return typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : null;
  } catch {
    return null;
  }
}

export const claudeAdapter: AgentAdapter = {
  id: "claude",
  label: "Claude",
  processMatchers: ["claude"],
  defaultModel: "sonnet",
  modelSuggestions: ["sonnet", "haiku", "opus"],
  switchable: true,
  quitCommand: "/exit",
  directActivitySource: "hooks",
  capabilities: {
    tabSwitching: true,
    manualPromptInjection: true,
    autonomousPromptLoop: true,
    sessionLifecycleSignals: true,
  },

  // Claude has no installer command exposed in the UI — it's distributed
  // separately via Anthropic's installer, and detection assumes the user
  // followed those instructions. Always "available" by convention so the
  // adapter never blocks the user from selecting it; if the binary really
  // is missing, the dispatch will surface a "command not found" error
  // honestly instead of silently falling back to another agent.
  detectAvailable(): AgentAvailability {
    return { available: true };
  },

  readConfiguredModel(): string | null {
    return readModelFromSettings(SETTINGS_FILE) ?? readModelFromSettings(DOTFILES_SETTINGS_FILE);
  },

  buildLaunchCommand({ dir }: AgentRuntimeConfig): string {
    return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${shellEscape(dir)} && claude`;
  },

  syncSelectedModel(model: string): void {
    try {
      let settings: Record<string, unknown> = {};
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) as Record<string, unknown>;
      } catch {
        // Fall through with an empty object.
      }
      settings.model = model.trim();
      fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch {
      // Don't fail FleetCrown updates if the agent settings sync fails.
    }
  },
};
