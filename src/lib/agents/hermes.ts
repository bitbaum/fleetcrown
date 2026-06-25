/**
 * Hermes adapter — Nous Research's autonomous, self-improving agent runtime.
 *
 * SPIKE (2026-06-25): proves FleetCrown orchestrates Hermes the same way it
 * already orchestrates claude/grok/codex — Hermes is a CLI (`hermes`) installed
 * via curl, run in a repo. Two reasons this matters strategically (see
 * docs/architecture/hosted-ephemeral-runner.md + Thoughts "The Captain Needs a
 * Ship"): (1) Hermes brings its OWN sandboxed backends (Docker/SSH/Daytona/
 * Modal) — so the hosted runner inherits sandboxed, laptop-free execution
 * instead of us building PTY isolation; (2) it brings a skill-acquisition loop
 * we don't have. We orchestrate it; we don't out-build it.
 *
 * Headless invocation (used by the hosted runner, see run-hermes.ts):
 *   HERMES_INFERENCE_MODEL=<model> hermes -z "<task>"   # prompt in, answer out
 * `--ignore-user-config` loads credentials from .env only (no Nous Portal
 * OAuth needed for a headless run on a chosen model).
 */

import path from "path";
import { existsSync } from "fs";
import { HOME } from "@/lib/constants";
import { shellEscape } from "@/lib/zellij";
import { commandExistsInPath } from "./helpers";
import type { AgentAdapter, AgentAvailability, AgentRuntimeConfig } from "./types";

export const hermesAdapter: AgentAdapter = {
  id: "hermes",
  label: "Hermes",
  processMatchers: ["hermes"],
  // Hermes routes to whatever model you point it at (model-agnostic runtime).
  defaultModel: "auto",
  modelSuggestions: ["auto", "anthropic/claude-sonnet-4.6", "hermes-4"],
  switchable: true,
  quitCommand: "/exit",
  installCommand: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
  sessionDir: "~/.hermes",
  directActivitySource: "native-session-log",
  capabilities: {
    tabSwitching: true,
    manualPromptInjection: true,
    autonomousPromptLoop: true,   // Hermes is an autonomous, self-improving runtime
    sessionLifecycleSignals: true,
  },

  detectAvailable(): AgentAvailability {
    if (commandExistsInPath("hermes")) return { available: true };
    if (existsSync(path.join(HOME, ".hermes"))) {
      return {
        available: false,
        availabilityReason: "Hermes config exists (~/.hermes), but the `hermes` CLI is not on $PATH. Run the installer from the Control panel.",
      };
    }
    return {
      available: false,
      availabilityReason: "Hermes CLI is not installed. Install it with the one-click installer (curl … nousresearch.com/install.sh).",
    };
  },

  readConfiguredModel(): string | null {
    // Hermes keeps its model in config.yaml / HERMES_INFERENCE_MODEL; no stable
    // file we read deterministically. Fall back to defaultModel ("auto").
    return null;
  },

  buildLaunchCommand({ dir }: AgentRuntimeConfig): string {
    // Interactive TUI for the local-runner path. Headless hosted runs use
    // `hermes -z` directly (run-hermes.ts), not this launcher.
    return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${shellEscape(dir)} && hermes chat`;
  },
};
