/**
 * Fleet-shaped questions plan the studio map FIRST, deterministically.
 * Run: npx tsx scripts/test/fleet-map-plan.ts
 */
import assert from "node:assert/strict";
import { planRetrieval } from "@/lib/agent/plan";

let pass = 0;
function check(name: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  ✓ ${name}`);
}

for (const q of [
  "What projects do we have, which are live, and what is each one for? Name the three pillars.",
  "what do we have?",
  "which sites are live",
  "what is happening across the studio",
  "how many projects are there",
  "what is loki for",
]) {
  check(`"${q}" leads with the fleet map, then the project rows`, () => {
    const plan = planRetrieval(q);
    assert.equal(plan.sources[0], "fleet_map", `got [${plan.sources.join(", ")}]`);
    assert.ok(plan.sources.includes("projects"));
  });
}

for (const q of [
  "which goal is stuck at 0%",
  "what did I promise Anna",
  "any feedback from visitors?",
]) {
  check(`"${q}" does not drag the map in`, () => {
    assert.ok(!planRetrieval(q).sources.includes("fleet_map"));
  });
}

console.log(`\nfleet-map-plan: ${pass} passed`);
