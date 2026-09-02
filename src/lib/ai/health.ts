/**
 * AI chain health — did the last completion actually work?
 *
 * The chat/tool/vision chains in groq.ts, agent/llm.ts and vision.ts are
 * correctness-complete: each one walks Groq -> OpenRouter (or the vision
 * equivalent) on failure, so a single dead vendor degrades instead of taking
 * the feature down. What none of them had was a place to REMEMBER whether
 * that walk is still succeeding. A chain that always has somewhere else to
 * try also always returns 200-shaped success to its caller, right up until
 * every link is dead — at which point the failure looks identical to any
 * other, and nothing short of a user complaint would ever surface it.
 *
 * This tracker is the fix: the real call sites in groq.ts, agent/llm.ts and
 * vision.ts record a success or failure once per top-level call, and
 * `/api/health` reads it back as an informational field. Mirrors the same
 * `ai-kit` tracker adopted fleet-wide (aoz-housing, surf-your-life,
 * truthseeker) — `downAfter: 3` matches their convention.
 */

import { createHealthTracker } from "ai-kit";

const tracker = createHealthTracker({ downAfter: 3 });

export function recordAIHealthSuccess(): void {
  tracker.recordSuccess();
}

export function recordAIHealthFailure(error: unknown): void {
  tracker.recordFailure(error);
}

export function getAIHealth() {
  return tracker.getHealth();
}

export function resetAIHealth(): void {
  tracker.reset();
}
