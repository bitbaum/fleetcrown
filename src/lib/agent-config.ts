import {
  getDefaultAgentId,
  type Agent,
  type AgentRegistryEntry,
  listAgentRegistry,
} from "@/lib/agent-registry";
import { readAgentPreferences, resolveAgentConfig, writeAgentPreferences } from "@/lib/agent-preferences";
export { buildAgentLaunchCommand } from "@/lib/agent-registry";

export type AgentConfig = {
  agent: Agent;
  model: string;
};

export type AgentRegistry = {
  agents: AgentRegistryEntry[];
  defaultAgent: Agent;
};

export function readAgentConfig(): AgentConfig {
  return resolveAgentConfig(readAgentPreferences());
}

export function writeAgentConfig(config: AgentConfig): void {
  const current = readAgentPreferences();
  writeAgentPreferences({
    ...current,
    defaultAgent: config.agent,
    models: {
      ...current.models,
      [config.agent]: config.model,
    },
  });
}

export function readAgentRegistry(): AgentRegistry {
  const agents = listAgentRegistry();
  return {
    agents,
    defaultAgent: getDefaultAgentId(),
  };
}
