import assert from "node:assert/strict";
import { toPromptDisplayFields, stripHarnessScaffolding } from "@/lib/activity-status";

const custom = toPromptDisplayFields({
  customPrompt: "typed by user",
  resolvedPrompt: "rendered template",
  intent: "next_best",
});
assert.equal(custom.displayText, "typed by user");
assert.equal(custom.isCustom, true);

const templated = toPromptDisplayFields({
  customPrompt: null,
  resolvedPrompt: "rendered next best prompt",
  intent: "next_best",
});
assert.equal(templated.displayText, "rendered next best prompt");
assert.equal(templated.isCustom, false);

const whitespace = toPromptDisplayFields({
  customPrompt: "   ",
  resolvedPrompt: "  rendered after trim guard  ",
  intent: "quality",
});
assert.equal(whitespace.displayText, "  rendered after trim guard  ");
assert.equal(whitespace.isCustom, false);

const legacy = toPromptDisplayFields({
  customPrompt: null,
  resolvedPrompt: null,
  intent: "deploy_check",
});
assert.equal(legacy.displayText, "Deploy check");
assert.equal(legacy.isCustom, false);

// Harness scaffolding is stripped from the display title…
const noisy = toPromptDisplayFields({
  customPrompt: "<task-notification><task-id>abc</task-id><summary>done</summary></task-notification>\nFix the login bug",
  resolvedPrompt: null,
  intent: "next_best",
});
assert.equal(noisy.displayText, "Fix the login bug");
assert.equal(noisy.isCustom, true);

// …and when the custom text is ALL scaffolding, fall through to the next source.
const allNoise = toPromptDisplayFields({
  customPrompt: "<system-reminder>background context</system-reminder>",
  resolvedPrompt: "rendered fallback",
  intent: "quality",
});
assert.equal(allNoise.displayText, "rendered fallback");

// Clean prompts (no harness tags) pass through verbatim, whitespace included.
assert.equal(stripHarnessScaffolding("  plain text  "), "  plain text  ");
assert.equal(stripHarnessScaffolding("has < but not a tag"), "has < but not a tag");

console.log("7/7 prompt history display cases passed");
