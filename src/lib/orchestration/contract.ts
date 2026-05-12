export const ORCHESTRATION_STATES = [
  "idle",
  "running",
  "waiting",
  "done",
  "closing",
  "closed",
  "error",
] as const;

export type OrchestrationState = (typeof ORCHESTRATION_STATES)[number];

export const ORCHESTRATION_EVENTS = [
  "task_started",
  "input_requested",
  "task_progressed",
  "task_completed",
  "continue_requested",
  "close_requested",
  "session_closed",
  "task_failed",
] as const;

export type OrchestrationEventType = (typeof ORCHESTRATION_EVENTS)[number];

export const ORCHESTRATION_CAPABILITIES = [
  "launchSession",
  "injectTask",
  "detectRunning",
  "detectWaiting",
  "detectDone",
  "closeSession",
  "autonomousContinue",
  "sessionHandoff",
] as const;

export type OrchestrationCapability = (typeof ORCHESTRATION_CAPABILITIES)[number];

export const ORCHESTRATION_ADAPTER_IDS = ["claude", "codex", "openclaw", "gemini"] as const;
export type AdapterId = (typeof ORCHESTRATION_ADAPTER_IDS)[number];

export type AdapterCapabilities = Record<OrchestrationCapability, boolean>;

export const ORCHESTRATION_TASK_INTENT_IDS = [
  "next_best",
  "test_and_fix",
  "quality",
  "full_audit",
  "product",
  "ux_review",
  "deploy_check",
  "commit_push",
  "close_session",
  "hard_stop",
  "continue",
  "custom",
] as const;
export type OrchestrationTaskIntentId = (typeof ORCHESTRATION_TASK_INTENT_IDS)[number];

export type OrchestrationTaskIntent = {
  id: OrchestrationTaskIntentId;
  name: string;
  objective: string;
  requiresVerification: boolean;
  requiresSessionHandoff: boolean;
};

export type OrchestrationTaskRequest = {
  projectKey: string;
  projectPath: string;
  adapter: AdapterId;
  intent: OrchestrationTaskIntentId;
  model?: string;
  customInstructions?: string;
};

export const ORCHESTRATION_TASK_SUMMARY_FIELDS = ["done", "next", "tests", "todos", "health"] as const;
export type OrchestrationTaskSummaryField = (typeof ORCHESTRATION_TASK_SUMMARY_FIELDS)[number];

export type OrchestrationTaskSummary = Record<OrchestrationTaskSummaryField, string>;

export type OrchestrationTaskStatus = {
  state: OrchestrationState;
  startedAt?: string;
  updatedAt?: string;
  summary?: OrchestrationTaskSummary;
  detail?: string;
};

export type OrchestrationLifecycleEvent = {
  type: OrchestrationEventType;
  at: string;
  detail?: string;
};

export interface AgentAdapter {
  readonly id: AdapterId;
  readonly label: string;
  readonly capabilities: AdapterCapabilities;

  launchSession?(request: OrchestrationTaskRequest): Promise<void>;
  injectTask(request: OrchestrationTaskRequest): Promise<void>;
  getStatus(request: OrchestrationTaskRequest): Promise<OrchestrationTaskStatus>;
  closeSession?(request: OrchestrationTaskRequest): Promise<void>;
}

export function createCapabilities(
  overrides: Partial<AdapterCapabilities> = {},
): AdapterCapabilities {
  return {
    launchSession: false,
    injectTask: false,
    detectRunning: false,
    detectWaiting: false,
    detectDone: false,
    closeSession: false,
    autonomousContinue: false,
    sessionHandoff: false,
    ...overrides,
  };
}
