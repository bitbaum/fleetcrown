/**
 * Inline self-tests for the digest data layer — exercises the pure helpers
 * (isErrorRun, runStatus, promptDisplayBody) and the project-status rollup.
 * Does NOT hit Postgres or Groq; getProjectDigest itself is integration code
 * exercised via the running app.
 *
 * Run: npm run test:digest
 */

import { isErrorRun, runStatus, promptDisplayBody } from "@/lib/activity-status";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;

  // ─── isErrorRun ──────────────────────────────────────────────────────────
  assert(
    isErrorRun({ state: null, outcome: "error", payload: null, finishedAt: new Date() }),
    "outcome=error → error",
  );
  passed++;

  assert(
    isErrorRun({ state: "error", outcome: null, payload: null, finishedAt: null }),
    "state=error → error",
  );
  passed++;

  assert(
    isErrorRun({ state: null, outcome: "success", payload: { error: "boom" }, finishedAt: new Date() }),
    "payload.error truthy → error (even if outcome=success)",
  );
  passed++;

  assert(
    !isErrorRun({ state: "completed", outcome: "success", payload: null, finishedAt: new Date() }),
    "successful completion → NOT error",
  );
  passed++;

  // ─── runStatus ──────────────────────────────────────────────────────────
  assert(
    runStatus({ state: null, outcome: "error", payload: null, finishedAt: new Date() }) === "negative",
    "error outcome → negative",
  );
  passed++;

  assert(
    runStatus({ state: "running", outcome: null, payload: null, finishedAt: null }) === "warning",
    "running with no finish → warning",
  );
  passed++;

  assert(
    runStatus({ state: "completed", outcome: "success", payload: null, finishedAt: new Date() }) === "positive",
    "success outcome → positive",
  );
  passed++;

  assert(
    runStatus({ state: "completed", outcome: "partial", payload: null, finishedAt: new Date() }) === "warning",
    "partial outcome → warning",
  );
  passed++;

  assert(
    runStatus({ state: "queued", outcome: null, payload: null, finishedAt: null }) === "neutral",
    "queued with no outcome → neutral",
  );
  passed++;

  // ─── promptDisplayBody ───────────────────────────────────────────────────
  assert(
    promptDisplayBody({ customPrompt: "user typed this", resolvedPrompt: "rendered", intent: "next_best" }) === "user typed this",
    "customPrompt wins when present",
  );
  passed++;

  assert(
    promptDisplayBody({ customPrompt: null, resolvedPrompt: "rendered template", intent: "next_best" }) === "rendered template",
    "resolvedPrompt wins over intent label when no custom",
  );
  passed++;

  assert(
    promptDisplayBody({ customPrompt: null, resolvedPrompt: null, intent: "next_best" }).length > 0,
    "intent label is non-empty fallback",
  );
  passed++;

  assert(
    promptDisplayBody({ customPrompt: "", resolvedPrompt: "rendered", intent: "next_best" }) === "rendered",
    "empty customPrompt falls through to resolvedPrompt",
  );
  passed++;

  console.log(`✓ ${passed} digest helper tests passed`);
}

try {
  runTests();
} catch (err) {
  console.error("✗ test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
