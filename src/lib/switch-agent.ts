
type Agent = "codex" | "claude";

function sanitizeAgentConfig(raw: Partial<{ agent: string; model: string }>): { agent: Agent; model: string } {
  const agent: Agent = raw.agent === "claude" ? "claude" : "codex";
  const fallbackModel = agent === "claude" ? "sonnet" : "gpt-5.4";
  const model = typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : fallbackModel;
  return { agent, model };
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildAgentLaunchCommand(config: { agent: Agent; model: string }, dir: string): string {
  const escapedDir = shellEscape(dir);
  if (config.agent === "claude") return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && claude`;
  const escapedModel = shellEscape(config.model);
  return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && codex --model ${escapedModel} --no-alt-screen`;
}
import { readAgentPreferences, resolveAgentConfig, writeAgentPreferences } from "@/lib/agent-preferences";
import { restartOpenProjectTabs, type SwitchTabResult } from "@/lib/agent-runtime";

export type SwitchAgentInput = {
  agent: string;
  model: string;
  applyToOpenTabs?: boolean;
};

export type SwitchAgentResult = {
  config: { agent: "claude" | "codex"; model: string };
  preferences: ReturnType<typeof readAgentPreferences>;
  tabResults: SwitchTabResult[];
};

export class SwitchAgentError extends Error {
  constructor(
    message: string,
    public readonly result: SwitchAgentResult,
  ) {
    super(message);
  }
}

export function switchAgent(input: SwitchAgentInput): SwitchAgentResult {
  const nextConfig = sanitizeAgentConfig(input);
  const currentPreferences = readAgentPreferences();
  const nextPreferences = {
    ...currentPreferences,
    defaultAgent: nextConfig.agent,
    models: {
      ...currentPreferences.models,
      [nextConfig.agent]: nextConfig.model,
    },
  };

  const tabResults = input.applyToOpenTabs
    ? restartOpenProjectTabs((dir) => buildAgentLaunchCommand(nextConfig, dir))
    : [];

  const failedTabs = tabResults.filter((result) => result.status === "failed");
  const wrotePreferences = failedTabs.length === 0
    ? writeAgentPreferences(nextPreferences)
    : currentPreferences;

  const resolvedConfig = failedTabs.length === 0
    ? resolveAgentConfig(wrotePreferences)
    : resolveAgentConfig(currentPreferences);

  const result: SwitchAgentResult = {
    config: resolvedConfig,
    preferences: wrotePreferences,
    tabResults,
  };

  if (failedTabs.length > 0) {
    throw new SwitchAgentError(
      `Failed to switch ${failedTabs.length} tab${failedTabs.length === 1 ? "" : "s"}. Default settings were left unchanged.`,
      result,
    );
  }

  return result;
}
