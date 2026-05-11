import { listAgentRegistry, type AgentOption, type AgentRegistryEntry } from "@/lib/agent-registry";

export type SwitchableAgent = "codex" | "claude";

type AgentCatalogEntry = AgentRegistryEntry & {
  id: AgentOption;
};

export type AgentCatalog = {
  defaultAgent: SwitchableAgent;
  agents: AgentCatalogEntry[];
};

export function buildSwitchableAgentCatalog(models: Partial<Record<SwitchableAgent, string>>, defaultAgent: SwitchableAgent): AgentCatalog {
  const agents = listAgentRegistry().map((entry) => {
    if (entry.id === "codex") {
      const model = models.codex?.trim() || entry.defaultModel;
      return {
        ...entry,
        defaultModel: model,
        modelSuggestions: [...new Set([model, ...entry.modelSuggestions])],
      };
    }
    if (entry.id === "claude") {
      const model = models.claude?.trim() || entry.defaultModel;
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
