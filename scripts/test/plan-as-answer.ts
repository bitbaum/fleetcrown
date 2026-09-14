/**
 * The plan-as-answer detector (lib/loki/plan-as-answer.ts).
 *
 * The fixture is the verbatim opening of the 2026-09-14 reply: the Groq
 * fallback narrated how it would answer and never answered. It must be caught;
 * real answers — including ones that mention "we" — must not.
 * Run: npx tsx scripts/test/plan-as-answer.ts
 */
import assert from "node:assert/strict";
import { looksLikePlan } from "@/lib/loki/plan-as-answer";

let pass = 0;
function check(name: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  ✓ ${name}`);
}

const leak = `We need to answer: "What projects do we have, which are live, and what is each one for? Name the three pillars."

We must cite record IDs for each claim. The records include many projects (F2-F36). We need to list projects, which are live (status active?), and what each one for (description). Also name the three pillars (from fleet map: Pillar orangecat (economic layer), Pillar loki (capability layer), Pillar solon (governance layer)). Must cite record IDs for each claim.

We need to ensure we only use facts from records.`;

check("the 2026-09-14 leak is a plan", () => assert.equal(looksLikePlan(leak), true));
check("a plan spread over the opening paragraph is a plan", () =>
  assert.equal(
    looksLikePlan(
      "The user asks for the pillars. We must cite F1. We should list them in order.\n- loki",
    ),
    true,
  ),
);
check("a real answer is not a plan", () => {
  assert.equal(
    looksLikePlan(
      "The three pillars are OrangeCat (economic layer) [F1], Loki (capability layer) [F1] and Solon (governance layer) [F1].\n\nLive: loki, orangecat, solon, datacat…",
    ),
    false,
  );
});
check("'we' in the operator's own voice is not a plan", () => {
  assert.equal(looksLikePlan("We have 35 projects; 14 are live [F1]. We ship from Loki."), false);
  assert.equal(looksLikePlan("Not in your data."), false);
  assert.equal(looksLikePlan(""), false);
});

console.log(`\nplan-as-answer: ${pass} passed`);
