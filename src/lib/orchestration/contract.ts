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

export type AdapterId = "claude" | "codex" | "openclaw" | "gemini";

export type AdapterCapabilities = Record<OrchestrationCapability, boolean>;

export type OrchestrationTaskIntentId =
  | "next_best"
  | "test_and_fix"
  | "quality"
  | "full_audit"
  | "product"
  | "ux_review"
  | "deploy_check"
  | "commit_push"
  | "close_session"
  | "continue"
  | "custom";

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

export type OrchestrationTaskSummary = {
  done: string;
  next: string;
  tests: string;
  todos: string;
  health: string;
};

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
