import { listAgentRegistry, type Agent, type AgentOption, type AgentRegistryEntry } from "@/lib/agent-registry";

export type SwitchableAgent = Agent;

type AgentCatalogEntry = AgentRegistryEntry & {
  id: AgentOption;
};

export type AgentCatalog = {
  defaultAgent: SwitchableAgent;
  agents: AgentCatalogEntry[];
};

function isSwitchableAgent(id: AgentOption): id is SwitchableAgent {
  return id === "claude" || id === "codex" || id === "gemini";
}

export function buildSwitchableAgentCatalog(models: Partial<Record<SwitchableAgent, string>>, defaultAgent: SwitchableAgent): AgentCatalog {
  const agents = listAgentRegistry().map((entry) => {
    if (entry.switchable && isSwitchableAgent(entry.id)) {
      const model = models[entry.id]?.trim() || entry.defaultModel;
      return {
        ...entry,
        defaultModel: model,
        modelSuggestions: [...new Set([model, ...entry.modelSuggestions])],
      };
    }
    return entry;
  });

  return { defaultAgent, agents };
}
