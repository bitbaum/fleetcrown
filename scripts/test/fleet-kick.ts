/**
 * Inline tests for fleet-kick helpers and Loki NL detection.
 * Run: npm run test:fleet-kick
 */
import assert from "node:assert/strict";
import { sortProjectsForKick } from "@/lib/fleet-kick";
import { isDevelopAllFleetRequest } from "@/lib/loki-fleet-commands";

function testSortProjectsForKick() {
  const ready = new Set(["beta", "alpha"]);
  const sorted = sortProjectsForKick(["zeta", "alpha", "beta", "gamma"], ready);
  assert.deepEqual(sorted, ["alpha", "beta", "gamma", "zeta"]);
}

function testDevelopAllFleetPhrases() {
  assert.equal(isDevelopAllFleetRequest("develop all my projects"), true);
  assert.equal(isDevelopAllFleetRequest("build the whole fleet"), true);
  assert.equal(isDevelopAllFleetRequest("start every project"), true);
  assert.equal(isDevelopAllFleetRequest("code review for fleetcrown"), false);
  assert.equal(isDevelopAllFleetRequest("next best for fleetcrown"), false);
}

testSortProjectsForKick();
testDevelopAllFleetPhrases();

console.log("✓ fleet-kick helper tests passed");
