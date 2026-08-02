// Pure unit test: escalation ladder mapping, prompt block, brake SSOT.
// No DB, no network — auto-discovered by scripts/test-unit.ts.
import assert from "node:assert";
import {
  ESCALATION_LEVELS,
  ESCALATION_HUMAN_STREAK,
  levelForStreak,
  escalationInstruction,
  renderEscalationBlock,
} from "../../src/lib/orchestration/escalation-ladder";
import { FAILURE_BRAKE_STREAK } from "../../src/lib/orchestration/dispatch-gates";

// Ladder shape: exactly the canonical four rungs, in order.
assert.deepEqual([...ESCALATION_LEVELS], ["retry", "patch", "replan", "human"]);

// Streak → rung mapping, clamped at the top.
assert.equal(levelForStreak(0), null);
assert.equal(levelForStreak(-2), null);
assert.equal(levelForStreak(1), "retry");
assert.equal(levelForStreak(2), "patch");
assert.equal(levelForStreak(3), "replan");
assert.equal(levelForStreak(4), "human");
assert.equal(levelForStreak(99), "human");

// THE invariant this design hangs on: the failure brake trips exactly when the
// ladder reaches 'human' — one constant, imported, so they can never drift.
assert.equal(FAILURE_BRAKE_STREAK, ESCALATION_HUMAN_STREAK);
assert.equal(levelForStreak(FAILURE_BRAKE_STREAK), "human");
assert.equal(levelForStreak(FAILURE_BRAKE_STREAK - 1), "replan");

// Every rung has a non-empty, distinct instruction.
const instructions = ESCALATION_LEVELS.map(escalationInstruction);
assert.ok(instructions.every((i) => i.length > 40));
assert.equal(new Set(instructions).size, ESCALATION_LEVELS.length);
// The rungs escalate in commitment: patch forbids same-approach retry; replan
// demands a different approach and sanctions blocking.
assert.ok(escalationInstruction("patch").includes("Do NOT retry the same approach"));
assert.ok(escalationInstruction("replan").includes("re-plan"));
assert.ok(escalationInstruction("replan").includes("status: blocked"));

// Prompt block: carries rung, instruction, and the truncated last failure.
const block = renderEscalationBlock({
  level: "patch",
  failStreak: 2,
  lastError: "npm test exited 1: 3 failures in payments.spec".padEnd(600, "x"),
});
assert.ok(block);
assert.ok(block!.startsWith("## Escalation state"));
assert.ok(block!.includes("rung 2/4: PATCH"));
assert.ok(block!.includes("Last recorded failure: npm test exited 1"));
assert.ok(block!.length < 1200, "last error must be truncated");

// No block at 'human' — nothing should be dispatching there (the brake owns it).
assert.equal(renderEscalationBlock({ level: "human", failStreak: 4 }), null);

// No error → no failure line, block still valid.
const clean = renderEscalationBlock({ level: "retry", failStreak: 1 });
assert.ok(clean && !clean.includes("Last recorded failure"));

console.log("escalation-ladder: all assertions passed");
