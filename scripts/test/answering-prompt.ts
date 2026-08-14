/**
 * The answering round must not be taught a protocol it is forbidden to use.
 *
 * Production failure this pins: the loop ran all three rounds and then returned
 * NOTHING. Tools are disabled at the API layer on the final round, but the
 * system prompt still explained the TOOL:/ARGS: text protocol and listed the
 * catalog — so the model wrote a tool call anyway, `stripToolCallLines` removed
 * those lines, and the operator got an empty reply that fell back to the
 * gateway. The loop had done all the work and thrown the answer away.
 *
 * Run: npm run test:answering-prompt
 */
import { systemPrompt } from "@/lib/agent/loop";
import { defineTool } from "@/lib/agent/tools/registry";
import type { ToolRegistry } from "@/lib/agent/tools/registry";
import { z } from "zod";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const registry: ToolRegistry = {
  search_people: defineTool({
    name: "search_people",
    kind: "read",
    description: "Find a contact by name.",
    params: z.object({ query: z.string() }),
    handler: async () => ({ facts: [] }),
  }),
};

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const gathering = systemPrompt(registry, true);
const answering = systemPrompt(registry, false);

check("the gathering round still teaches the text protocol", () => {
  assert(/TOOL:/.test(gathering), "gathering prompt lost the TOOL: protocol");
  assert(/ARGS:/.test(gathering), "gathering prompt lost the ARGS: line");
  assert(gathering.includes("search_people"), "gathering prompt lost the tool catalog");
});

check("the answering round teaches NO protocol to write", () => {
  // The one mention allowed is the prohibition itself.
  const lines = answering.split("\n").filter((l) => /TOOL:|ARGS:/.test(l));
  assert(lines.length <= 1, `answering prompt still shows the protocol:\n${lines.join("\n")}`);
  assert(/do not write TOOL:/.test(answering), "the prohibition is missing");
});

check("the answering round drops the tool catalog", () => {
  assert(!answering.includes("## Tools"), "catalog header survived into the answering prompt");
});

check("the answering round says to answer now", () => {
  assert(/Answer NOW/i.test(answering), "no instruction to produce the answer");
});

check("dropping the catalog returns real budget to the facts", () => {
  assert(
    answering.length < gathering.length,
    `answering prompt is not smaller (${answering.length} vs ${gathering.length})`,
  );
});

check("both rounds keep the guardrails that stop invented action", () => {
  for (const [name, p] of [
    ["gathering", gathering],
    ["answering", answering],
  ] as const) {
    assert(/NO power to act/.test(p), `${name} prompt lost the no-power-to-act rule`);
    assert(/not browsed the web/.test(p), `${name} prompt lost the no-browsing rule`);
    assert(/Cite the record id/.test(p), `${name} prompt lost the citation rule`);
  }
});

console.log(`\n${passed} passed`);
