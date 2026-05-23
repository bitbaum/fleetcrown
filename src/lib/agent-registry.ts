import fs from "fs";
import path from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { HOME } from "@/lib/constants";
import { shellEscape } from "@/lib/zellij";

const CLAUDE_SETTINGS_FILE = path.join(HOME, ".claude", "settings.json");
const DOTFILES_CLAUDE_SETTINGS_FILE = path.join(HOME, "dev", "dotfiles", ".claude", "settings.json");

export const AGENT_IDS = ["codex", "claude", "gemini", "cursor"] as const;
export const AGENT_FALLBACK_ORDER: readonly Agent[] = ["claude", "cursor", "codex", "gemini"];
export type Agent = (typeof AGENT_IDS)[number];
export type AgentOption = Agent | "openclaw";

export const AGENT_DEFAULT_MODELS: Record<Agent, string> = {
  claude: "sonnet",
  codex:  "gpt-5.4",
  gemini: "auto",
  cursor: "auto",
};

export type AgentRegistryEntry = {
  id: AgentOption;
  label: string;
  defaultModel: string;
  modelSuggestions: string[];
  processMatchers: string[];
  switchable: boolean;
  available: boolean;
  availabilityReason?: string;
  /** Command to type into the terminal to gracefully exit this agent's CLI. */
  quitCommand: string;
  capabilities: {
    tabSwitching: boolean;
    manualPromptInjection: boolean;
    autonomousPromptLoop: boolean;
    sessionLifecycleSignals: boolean;
  };
};

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

function getCodexAvailability(): Pick<AgentRegistryEntry, "available" | "availabilityReason"> {
  if (commandExistsInPath("codex")) {
    return { available: true };
  }

  if (existsSync(path.join(HOME, ".codex"))) {
    return {
      available: false,
      availabilityReason: "Codex configuration exists, but no Codex CLI command is installed on PATH.",
    };
  }

  return {
    available: false,
    availabilityReason: "Codex CLI is not installed on this machine.",
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

/** Cursor Agent CLI (`agent`) — verify PATH binary is Cursor's, not a generic `agent`. */
function getCursorAvailability(): Pick<AgentRegistryEntry, "available" | "availabilityReason"> {
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
    // Fall through — still allow if binary exists under Cursor's typical path.
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
}

export function listAgentRegistry(): AgentRegistryEntry[] {
  const codexDefaultModel = readConfiguredCodexModel() ?? AGENT_DEFAULT_MODELS.codex;
  const claudeDefaultModel = readClaudeSettingsModel() ?? AGENT_DEFAULT_MODELS.claude;
  const codexAvailability = getCodexAvailability();
  const openclawAvailability = getOpenClawAvailability();
  const geminiAvailability = getGeminiAvailability();
  const cursorAvailability = getCursorAvailability();

  return [
    {
      id: "claude",
      label: "Claude",
      defaultModel: claudeDefaultModel,
      modelSuggestions: dedupeStrings([claudeDefaultModel, "sonnet", "haiku", "opus"]),
      processMatchers: ["claude"],
      switchable: true,
      available: true,
      quitCommand: "/exit",
      capabilities: {
        tabSwitching: true,
        manualPromptInjection: true,
        autonomousPromptLoop: true,
        sessionLifecycleSignals: true,
      },
    },
    {
      id: "cursor",
      label: "Cursor",
      defaultModel: AGENT_DEFAULT_MODELS.cursor,
      modelSuggestions: ["auto", "composer-1", "gpt-5.4", "claude-sonnet-4"],
      processMatchers: ["agent"],
      switchable: true,
      quitCommand: "",
      ...cursorAvailability,
      capabilities: {
        tabSwitching: true,
        manualPromptInjection: true,
        autonomousPromptLoop: false,
        sessionLifecycleSignals: false,
      },
    },
    {
      id: "codex",
      label: "Codex",
      defaultModel: codexDefaultModel,
      modelSuggestions: dedupeStrings([codexDefaultModel, "codex-4", "gpt-5.4"]),
      processMatchers: ["codex"],
      switchable: true,
      quitCommand: "q",
      ...codexAvailability,
      capabilities: {
        tabSwitching: true,
        manualPromptInjection: true,
        autonomousPromptLoop: false,
        sessionLifecycleSignals: false,
      },
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      defaultModel: "gateway-default",
      modelSuggestions: ["gateway-default"],
      processMatchers: ["openclaw"],
      switchable: false,
      quitCommand: "q",
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
      defaultModel: AGENT_DEFAULT_MODELS.gemini,
      modelSuggestions: [AGENT_DEFAULT_MODELS.gemini, "pro", "flash", "flash-lite"],
      processMatchers: ["gemini"],
      switchable: true,
      quitCommand: "q",
      ...geminiAvailability,
      capabilities: {
        tabSwitching: true,
        manualPromptInjection: true,
        autonomousPromptLoop: false,
        sessionLifecycleSignals: false,
      },
    },
  ];
}

export function sanitizeAgentId(value: string | undefined): Agent {
  if (value === "claude") return "claude";
  if (value === "gemini") return "gemini";
  if (value === "cursor") return "cursor";
  return "codex";
}

export function isAgentId(value: string | undefined | null): value is Agent {
  return value === "claude" || value === "codex" || value === "gemini" || value === "cursor";
}

export function looksLikeAgentCapacityIssue(text: string): boolean {
  return /rate\s*limit|quota|credit|usage\s*limit|token\s*limit|out\s+of\s+tokens|context\s*(window|length|limit)|maximum\s+context|insufficient\s+quota/i.test(text);
}

export function resolveNextAvailableAgent(currentAgent?: string | null): Agent | null {
  const current = isAgentId(currentAgent) ? currentAgent : null;
  const registry = listAgentRegistry();
  const available = new Set(
    registry
      .filter((entry) => entry.switchable && entry.available && entry.capabilities.tabSwitching && isAgentId(entry.id))
      .map((entry) => entry.id as Agent),
  );

  if (current) {
    const currentIndex = AGENT_FALLBACK_ORDER.indexOf(current);
    const afterCurrent = AGENT_FALLBACK_ORDER.slice(currentIndex + 1);
    for (const candidate of afterCurrent) {
      if (available.has(candidate)) return candidate;
    }
  }

  for (const candidate of AGENT_FALLBACK_ORDER) {
    if (candidate !== current && available.has(candidate)) return candidate;
  }

  return null;
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
  return buildAgentOptionLaunchCommand(config, dir);
}

export function buildAgentOptionLaunchCommand(config: { agent: AgentOption; model?: string }, dir: string): string {
  const escapedDir = shellEscape(dir);
  const model = config.model?.trim();

  switch (config.agent) {
    case "claude":
      return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && claude`;
    case "gemini": {
      const modelFlag = model ? ` -m ${shellEscape(model)}` : "";
      return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && gemini${modelFlag}`;
    }
    case "openclaw":
      return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && openclaw tui`;
    case "cursor":
      return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && agent`;
    case "codex":
    default: {
      const escapedModel = shellEscape(model || AGENT_DEFAULT_MODELS.codex);
      return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && codex --model ${escapedModel} --no-alt-screen`;
    }
  }
}
