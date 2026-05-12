import type { OrchestrationTaskIntentId } from "./contract";

/**
 * Compatibility map from the existing Claude prompt keys to neutral orchestration intents.
 * Keep this until the UI and runners no longer depend on Claude-era identifiers.
 */
export const CLAUDE_PROMPT_TO_INTENT: Record<string, OrchestrationTaskIntentId> = {
  next_best: "next_best",
  test_and_fix: "test_and_fix",
  quality: "quality",
  full_audit: "full_audit",
  product: "product",
  ux_review: "ux_review",
  deploy_check: "deploy_check",
  commit_push: "commit_push",
  close_session: "close_session",
  hard_stop: "hard_stop",
  continue: "continue",
};

export function mapClaudePromptToIntent(promptKey: string): OrchestrationTaskIntentId | null {
  return CLAUDE_PROMPT_TO_INTENT[promptKey] ?? null;
}
