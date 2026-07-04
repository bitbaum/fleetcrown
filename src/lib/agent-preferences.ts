import fs from "fs";
import path from "path";
import { APP_SLUG } from "@/config/brand";
import { HOME } from "@/lib/constants";
import { AGENT_DEFAULT_MODELS, type Agent, sanitizeAgentId, syncAgentSettings } from "@/lib/agent-registry";

const DEFAULT_AGENT: Agent = "claude";

const AGENT_PREFERENCES_FILE = path.join(HOME, ".config", `${APP_SLUG}-agent.json`);
const LEGACY_AGENT_PREFERENCES_FILE = path.join(HOME, ".config", "cockpit-agent.json");

export type AgentPreferences = {
  defaultAgent: Agent;
  models: Partial<Record<Agent, string>>;
};

type LegacyAgentConfig = {
  agent?: string;
  model?: string;
};

function sanitizeModel(agent: Agent, model: string | undefined): string {
  if (typeof model === "string" && model.trim()) {
    return model.trim();
  }
  return AGENT_DEFAULT_MODELS[agent];
}

function normalizePreferences(raw: Partial<AgentPreferences & LegacyAgentConfig>): AgentPreferences {
  const defaultAgent = sanitizeAgentId(raw.defaultAgent ?? raw.agent);
  const currentModels = raw.models ?? {};

  const models: Partial<Record<Agent, string>> = {
    claude: sanitizeModel("claude", currentModels.claude),
    codex: sanitizeModel("codex", currentModels.codex),
    gemini: sanitizeModel("gemini", currentModels.gemini),
    cursor: sanitizeModel("cursor", currentModels.cursor),
  };

  if (!currentModels[defaultAgent] && raw.model) {
    models[defaultAgent] = sanitizeModel(defaultAgent, raw.model);
  }

  return { defaultAgent, models };
}

export function readAgentPreferences(): AgentPreferences {
  try {
    const file = fs.existsSync(AGENT_PREFERENCES_FILE)
      ? AGENT_PREFERENCES_FILE
      : LEGACY_AGENT_PREFERENCES_FILE;
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<AgentPreferences & LegacyAgentConfig>;
    return normalizePreferences(raw);
  } catch {
    const defaultAgent = DEFAULT_AGENT;
    return normalizePreferences({ defaultAgent });
  }
}

export function writeAgentPreferences(preferences: AgentPreferences): AgentPreferences {
  const normalized = normalizePreferences(preferences);
  fs.mkdirSync(path.dirname(AGENT_PREFERENCES_FILE), { recursive: true });
  fs.writeFileSync(AGENT_PREFERENCES_FILE, JSON.stringify(normalized, null, 2));

  syncAgentSettings("claude", normalized.models.claude ?? AGENT_DEFAULT_MODELS.claude);
  return normalized;
}

export function resolveAgentConfig(preferences = readAgentPreferences()): { agent: Agent; model: string } {
  const agent = preferences.defaultAgent;
  return {
    agent,
    model: preferences.models[agent] ?? AGENT_DEFAULT_MODELS[agent],
  };
}
