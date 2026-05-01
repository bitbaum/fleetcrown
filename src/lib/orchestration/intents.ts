import type { OrchestrationTaskIntent, OrchestrationTaskIntentId } from "./contract";

export const ORCHESTRATION_INTENTS: Record<OrchestrationTaskIntentId, OrchestrationTaskIntent> = {
  next_best: {
    id: "next_best",
    name: "Next Best Task",
    objective: "Pick the highest-impact next action from interrupted work, broken flows, quality issues, and mission alignment, then execute it fully.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  test_and_fix: {
    id: "test_and_fix",
    name: "Test and Fix",
    objective: "Run tests, inspect critical flows, and fix the highest-value failures until the project is in a better verified state.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  quality: {
    id: "quality",
    name: "Quality Pass",
    objective: "Improve code health without adding features by addressing DRY, SSOT, complexity, and TODO debt.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  full_audit: {
    id: "full_audit",
    name: "Full Audit",
    objective: "Audit the project broadly, prioritize by user impact, and execute the single highest-priority item fully.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  product: {
    id: "product",
    name: "Product Review",
    objective: "Step back, identify the highest-leverage product improvement, and apply one concrete fix.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  ux_review: {
    id: "ux_review",
    name: "UX Review",
    objective: "Review the interface as a demanding user, identify the top UX issues, and fix the most important ones.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  deploy_check: {
    id: "deploy_check",
    name: "Deploy Check",
    objective: "Run the pre-deploy quality gate, fix blockers, and only then prepare to ship.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  commit_push: {
    id: "commit_push",
    name: "Commit and Push",
    objective: "Verify the work, review changes, commit cleanly, push, and report the shipped result.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  close_session: {
    id: "close_session",
    name: "Close Session",
    objective: "Leave the project in a cold-start-safe state with quality checks, tests, and a crisp handoff.",
    requiresVerification: true,
    requiresSessionHandoff: true,
  },
  continue: {
    id: "continue",
    name: "Continue",
    objective: "Resolve the pending question using available context and keep going without re-asking for the same missing detail.",
    requiresVerification: false,
    requiresSessionHandoff: true,
  },
};

export function getOrchestrationIntent(intentId: OrchestrationTaskIntentId): OrchestrationTaskIntent {
  return ORCHESTRATION_INTENTS[intentId];
}
