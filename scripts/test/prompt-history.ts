import assert from "node:assert/strict";
import { toPromptDisplayFields } from "@/lib/activity-status";

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

console.log("4/4 prompt history display cases passed");
