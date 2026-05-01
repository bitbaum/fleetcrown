export type SwitchableAgent = "codex" | "claude";

export type AgentCatalogEntry = {
  id: SwitchableAgent;
  label: string;
  defaultModel: string;
  modelSuggestions: string[];
  processMatchers: string[];
  switchable: true;
  available: true;
  availabilityReason?: string;
  capabilities: {
    tabSwitching: boolean;
    manualPromptInjection: boolean;
    autonomousPromptLoop: boolean;
    sessionLifecycleSignals: boolean;
  };
};

export type AgentCatalog = {
  defaultAgent: SwitchableAgent;
  agents: AgentCatalogEntry[];
};

export function buildSwitchableAgentCatalog(models: Partial<Record<SwitchableAgent, string>>, defaultAgent: SwitchableAgent): AgentCatalog {
  const codexModel = models.codex?.trim() || "gpt-5.4";
  const claudeModel = models.claude?.trim() || "sonnet";

  return {
    defaultAgent,
    agents: [
      {
        id: "codex",
        label: "Codex",
        defaultModel: codexModel,
        modelSuggestions: [codexModel, "gpt-5.4", "gpt-5-codex"],
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
        defaultModel: claudeModel,
        modelSuggestions: [
          claudeModel,
          "sonnet",
          "opus",
          "haiku",
          "claude-sonnet-4-5",
          "claude-opus-4-1",
          "claude-3-7-sonnet-latest",
        ],
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
    ],
  };
}
