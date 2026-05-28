import { listAgentRegistry, type Agent, type AgentOption, type AgentRegistryEntry } from "@/lib/agent-registry";

export type SwitchableAgent = Agent;

type AgentCatalogEntry = AgentRegistryEntry & {
  id: AgentOption;
};

export type AgentCatalog = {
  defaultAgent: SwitchableAgent;
  agents: AgentCatalogEntry[];
};

export type AgentAvailabilityOverride = Partial<Record<AgentOption, boolean>>;

function isSwitchableAgent(id: AgentOption): id is SwitchableAgent {
  // Driven from the registry's switchable flag where possible; this is a legacy gate
  // that we are relaxing as the registry becomes the full SSOT.
  return id === "claude" || id === "codex" || id === "gemini" || id === "cursor" || id === "grok";
}

export function buildSwitchableAgentCatalog(
  models: Partial<Record<SwitchableAgent, string>>,
  defaultAgent: SwitchableAgent,
  availabilityOverride?: AgentAvailabilityOverride,
): AgentCatalog {
  const agents = listAgentRegistry().map((entry) => {
    const override = availabilityOverride?.[entry.id];
    const availability = override === undefined
      ? {}
      : {
          available: override,
          availabilityReason: override ? undefined : `${entry.label} was not reported as installed by the connected computer.`,
        };
    // Models are user-configured only for the Agent union; openclaw remains
    // launchable in the catalog but has no per-user model preference.
    if (entry.switchable && isSwitchableAgent(entry.id)) {
      const model = models[entry.id]?.trim() || entry.defaultModel;
      return {
        ...entry,
        ...availability,
        defaultModel: model,
        modelSuggestions: [...new Set([model, ...entry.modelSuggestions])],
      };
    }
    return { ...entry, ...availability };
  });

  return { defaultAgent, agents };
}
