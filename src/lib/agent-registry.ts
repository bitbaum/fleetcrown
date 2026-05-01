import fs from "fs";
import path from "path";
import { existsSync } from "fs";
import { HOME } from "@/lib/constants";

const CLAUDE_SETTINGS_FILE = path.join(HOME, ".claude", "settings.json");
const DOTFILES_CLAUDE_SETTINGS_FILE = path.join(HOME, "dev", "dotfiles", ".claude", "settings.json");

export const AGENT_IDS = ["codex", "claude"] as const;
export type Agent = (typeof AGENT_IDS)[number];
export type AgentOption = Agent | "openclaw" | "gemini";

export type AgentRegistryEntry = {
  id: AgentOption;
  label: string;
  defaultModel: string;
  modelSuggestions: string[];
  processMatchers: string[];
  switchable: boolean;
  available: boolean;
  availabilityReason?: string;
  capabilities: {
    tabSwitching: boolean;
    manualPromptInjection: boolean;
    autonomousPromptLoop: boolean;
    sessionLifecycleSignals: boolean;
  };
};

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseTomlStringField(raw: string, key: string): string | null {
  const match = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"\\n]+)"`, "m"));
  return match?.[1]?.trim() || null;
}

function getCodexConfigCandidates(): string[] {
  return [path.join(HOME, ".codex", "config.toml")];
}

function readConfiguredCodexModel(): string | null {
  for (const file of getCodexConfigCandidates()) {
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const model = parseTomlStringField(raw, "model");
      if (model) return model;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function getClaudeSettingsCandidates(): string[] {
  return [CLAUDE_SETTINGS_FILE, DOTFILES_CLAUDE_SETTINGS_FILE];
}

function readClaudeSettingsModel(): string | null {
  for (const file of getClaudeSettingsCandidates()) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { model?: unknown };
      if (typeof raw.model === "string" && raw.model.trim()) {
        return raw.model.trim();
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function dedupeStrings(values: string[]): string[] {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function commandExistsInPath(command: string): boolean {
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(":")) {
    if (!dir) continue;
    const candidate = `${dir}/${command}`;
    try {
      if (existsSync(candidate) && fs.statSync(candidate).mode & 0o111) {
        return true;
      }
    } catch {
      // Ignore malformed path entries.
    }
  }
  return false;
}

function getOpenClawAvailability(): Pick<AgentRegistryEntry, "available" | "availabilityReason"> {
  if (commandExistsInPath("openclaw")) {
    return { available: true };
  }

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
}

function getGeminiAvailability(): Pick<AgentRegistryEntry, "available" | "availabilityReason"> {
  if (commandExistsInPath("gemini")) {
    return { available: true };
  }

  if (existsSync(path.join(HOME, ".gemini"))) {
    return {
      available: false,
      availabilityReason: "Gemini configuration exists, but no Gemini CLI command is installed on PATH.",
    };
  }

  return {
    available: false,
    availabilityReason: "Gemini CLI is not installed on this machine.",
  };
}

export function listAgentRegistry(): AgentRegistryEntry[] {
  const codexDefaultModel = readConfiguredCodexModel() ?? "gpt-5.4";
  const claudeDefaultModel = readClaudeSettingsModel() ?? "sonnet";
  const openclawAvailability = getOpenClawAvailability();
  const geminiAvailability = getGeminiAvailability();

  return [
    {
      id: "codex",
      label: "Codex",
      defaultModel: codexDefaultModel,
      modelSuggestions: dedupeStrings([codexDefaultModel, "codex-4", "gpt-5.4"]),
      processMatchers: ["codex"],
      switchable: true,
      available: true,
      capabilities: {
        tabSwitching: true,
        manualPromptInjection: true,
        autonomousPromptLoop: false,
        sessionLifecycleSignals: false,
      },
    },
    {
      id: "claude",
      label: "Claude",
      defaultModel: claudeDefaultModel,
      modelSuggestions: dedupeStrings([claudeDefaultModel, "sonnet", "haiku", "opus"]),
      processMatchers: ["claude"],
      switchable: true,
      available: true,
      capabilities: {
        tabSwitching: true,
        manualPromptInjection: true,
        autonomousPromptLoop: true,
        sessionLifecycleSignals: true,
      },
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      defaultModel: "gateway-default",
      modelSuggestions: ["gateway-default"],
      processMatchers: ["openclaw"],
      switchable: false,
      ...openclawAvailability,
      capabilities: {
        tabSwitching: false,
        manualPromptInjection: false,
        autonomousPromptLoop: false,
        sessionLifecycleSignals: false,
      },
    },
    {
      id: "gemini",
      label: "Gemini",
      defaultModel: "local-cli-default",
      modelSuggestions: ["local-cli-default"],
      processMatchers: ["gemini"],
      switchable: false,
      ...geminiAvailability,
      capabilities: {
        tabSwitching: false,
        manualPromptInjection: false,
        autonomousPromptLoop: false,
        sessionLifecycleSignals: false,
      },
    },
  ];
}

export function sanitizeAgentId(value: string | undefined): Agent {
  return value === "claude" ? "claude" : "codex";
}

function listSwitchableAgentRegistry(): Array<AgentRegistryEntry & { id: Agent }> {
  return listAgentRegistry().filter((entry): entry is AgentRegistryEntry & { id: Agent } => entry.switchable);
}

export function getDefaultAgentId(): Agent {
  return listSwitchableAgentRegistry()[0]?.id ?? "codex";
}

export function getAgentRegistryEntry(agent: Agent): AgentRegistryEntry {
  const registry = listSwitchableAgentRegistry();
  return registry.find((entry) => entry.id === agent) ?? registry[0];
}

export function getDefaultAgentConfig(): { agent: Agent; model: string } {
  const first = listSwitchableAgentRegistry()[0];
  return { agent: first?.id ?? "codex", model: first?.defaultModel ?? "gpt-5.4" };
}

export function sanitizeAgentConfig(raw: Partial<{ agent: string; model: string }>): { agent: Agent; model: string } {
  const fallback = getDefaultAgentConfig();
  const agent = sanitizeAgentId(raw.agent) ?? fallback.agent;
  const definition = getAgentRegistryEntry(agent);
  const model = typeof raw.model === "string" && raw.model.trim()
    ? raw.model.trim()
    : definition.defaultModel;

  return { agent, model };
}

export function syncAgentSettings(agent: Agent, model: string): void {
  if (agent !== "claude") return;

  try {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_FILE, "utf-8")) as Record<string, unknown>;
    } catch {
      // Fall through with an empty object.
    }

    settings.model = model.trim();
    fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {
    // Don't fail Cockpit updates if the agent settings sync fails.
  }
}

export function buildAgentLaunchCommand(config: { agent: Agent; model: string }, dir: string): string {
  const escapedDir = shellEscape(dir);
  if (config.agent === "claude") {
    return `cd ${escapedDir} && claude`;
  }

  const escapedModel = shellEscape(config.model);
  return `cd ${escapedDir} && codex --model ${escapedModel} --no-alt-screen`;
}
