/**
 * `/api/health` had no coverage at all before the AI health field was added.
 * This pins the one property that matters: `ai` is informational-only. A
 * dead AI chain (every vendor key exhausted) must never flip the 200/503 the
 * deploy's restart decision reads — a restart can't fix someone else's
 * outage, so gating it on AI status would bounce a healthy app pointlessly.
 *
 * Needs no database or network: `checkEnv`/`envHealthy` are pure env reads,
 * and the AI tracker is a local in-memory instance.
 *
 * Run: npx tsx scripts/test/health-route.ts
 */
import assert from "node:assert/strict";

async function main() {
  const { GET } = await import("../../src/app/api/health/route");
  const { NextRequest } = await import("next/server");
  const { getAIHealth, recordAIHealthFailure, resetAIHealth } =
    await import("../../src/lib/ai/health");

  function get() {
    return GET(new NextRequest("http://localhost/api/health"));
  }

  resetAIHealth();
  const before = await get();
  const beforeBody = await before.json();
  assert.equal(beforeBody.ai.status, "unknown", "expected the AI field to start unknown");

  // Drive the chain fully down (downAfter is 3) and confirm the status code
  // this deploy's restart decision reads is UNCHANGED by it.
  for (let i = 0; i < 5; i += 1) recordAIHealthFailure(new Error("all vendors exhausted"));
  assert.equal(getAIHealth().status, "down", "test setup: tracker did not go down");

  const after = await get();
  const afterBody = await after.json();
  assert.equal(afterBody.ai.status, "down", "route did not read the live tracker state");
  assert.equal(
    after.status,
    before.status,
    `AI going down changed the HTTP status (${before.status} -> ${after.status}) — it must be informational only`,
  );
  assert.equal(
    afterBody.ok,
    beforeBody.ok,
    "AI going down changed body.ok — it must not affect the health verdict",
  );

  resetAIHealth();
  console.log("  ✓ ai field is present and status-code-neutral");
  console.log(`\n1 passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
