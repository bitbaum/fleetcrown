import { createCapabilities, type AdapterCapabilities, type AdapterId } from "./contract";

export type AdapterDefinition = {
  id: AdapterId;
  label: string;
  capabilities: AdapterCapabilities;
  notes: string;
};

export const ADAPTER_DEFINITIONS: Record<AdapterId, AdapterDefinition> = {
  claude: {
    id: "claude",
    label: "Claude",
    capabilities: createCapabilities({
      launchSession: true,
      injectTask: true,
      detectRunning: true,
      detectWaiting: true,
      detectDone: true,
      closeSession: true,
      autonomousContinue: true,
      sessionHandoff: true,
    }),
    notes: "Current production-grade adapter with local hook-driven lifecycle support.",
  },
  codex: {
    id: "codex",
    label: "Codex",
    capabilities: createCapabilities({
      launchSession: true,
      injectTask: true,
      detectRunning: true,
      sessionHandoff: true,
    }),
    notes: "Partially integrated backend; needs lifecycle and close-session support.",
  },
  openclaw: {
    id: "openclaw",
    label: "OpenClaw",
    capabilities: createCapabilities({
      injectTask: true,
      detectRunning: true,
      detectDone: true,
      autonomousContinue: true,
      sessionHandoff: true,
    }),
    notes: "Target orchestrator of record; should own durable task execution rather than imitate local Claude hooks.",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    capabilities: createCapabilities({
      launchSession: true,
    }),
    notes: "Detected locally but not meaningfully integrated into the orchestration workflow yet.",
  },
};

export function getAdapterDefinition(adapterId: AdapterId): AdapterDefinition {
  return ADAPTER_DEFINITIONS[adapterId];
}
