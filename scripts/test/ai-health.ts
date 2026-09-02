/**
 * The AI chain (groq.ts / agent/llm.ts / vision.ts) is correctness-complete —
 * it walks Groq -> OpenRouter on failure — but until this tracker existed
 * there was NO signal anywhere that says whether that walk is still
 * succeeding. A dead chain looks identical to a healthy one from the
 * outside: every caller catches the error and degrades on its own, so a
 * total outage would have been invisible until a user complained.
 *
 * These tests pin the state machine `/api/health` now depends on, and guard
 * against the two ways this class of fix goes wrong: the tracker never flips
 * status (silent no-op), or it gets instantiated but no call site ever
 * touches it (this exact bug was found and fixed elsewhere in this fleet).
 *
 * Run: npm run test:ai-health
 */
import {
  getAIHealth,
  recordAIHealthFailure,
  recordAIHealthSuccess,
  resetAIHealth,
} from "@/lib/ai/health";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const check = (label: string, fn: () => void) => {
  resetAIHealth();
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

check("starts unknown, before anything has been observed", () => {
  assert(getAIHealth().status === "unknown", "expected unknown before any call");
});

check("is ok after a success", () => {
  recordAIHealthSuccess();
  assert(getAIHealth().status === "ok", "expected ok after a success");
});

check("is degraded on the first failure, not down", () => {
  recordAIHealthFailure(new Error("every configured AI provider failed"));
  const health = getAIHealth();
  assert(health.status === "degraded", `expected degraded, got ${health.status}`);
  assert(
    health.lastError === "every configured AI provider failed",
    "lastError did not capture the message",
  );
});

check("is down once failures reach downAfter (3)", () => {
  for (let i = 0; i < 3; i += 1) recordAIHealthFailure(new Error("boom"));
  const health = getAIHealth();
  assert(health.status === "down", `expected down, got ${health.status}`);
  assert(
    health.consecutiveFailures === 3,
    `expected 3 consecutive failures, got ${health.consecutiveFailures}`,
  );
});

check("recovers to ok on the next success, and clears the failure streak", () => {
  for (let i = 0; i < 5; i += 1) recordAIHealthFailure(new Error("boom"));
  assert(getAIHealth().status === "down", "expected down before the recovering success");
  recordAIHealthSuccess();
  const health = getAIHealth();
  assert(health.status === "ok", "expected ok after recovery");
  assert(health.consecutiveFailures === 0, "consecutiveFailures did not reset on success");
  assert(health.lastError === null, "lastError did not clear on success");
});

console.log(`\n${passed} passed`);
