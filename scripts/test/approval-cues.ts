/**
 * Inline tests for the approval-queue seeding cue (lib/agent/context.ts).
 *
 * Why this is worth testing: the cue decides whether the approval queue reaches
 * the model at all on the TOOLLESS fallback path. When Groq's org TPM window is
 * exhausted the tool loop dies and the fallback answers from seed facts alone —
 * so a cue that misses means the operator is told nothing is pending when
 * something is. A miss is silent and looks like a truthful answer, which is the
 * worst possible failure shape.
 *
 * Run: npm run test:approval-cues
 */
import { APPROVAL_CUES, PLANNING_CUES } from "@/lib/agent/cues";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const hits = (message: string, why: string) => {
  assert(APPROVAL_CUES.test(message), `should seed approvals: ${JSON.stringify(message)} — ${why}`);
  passed += 1;
};
const misses = (message: string, why: string) => {
  assert(!APPROVAL_CUES.test(message), `should NOT seed approvals: ${JSON.stringify(message)} — ${why}`);
  passed += 1;
};

// The exact question that failed in production, including the operator's typo.
// "pening" is not "pending" — the match has to come from "approval", which is
// why the cue lists several independent words rather than one canonical term.
hits("what is pening for approval", "the reported production question, typo and all");
hits("what's pending for approval?", "the canonical phrasing");
hits("What is pending for approval?", "case-insensitive");

// Natural ways to ask the same thing.
hits("anything waiting on me?", "waiting");
hits("show me the approval queue", "queue");
hits("do I need to approve anything", "approve");
hits("what needs a decision", "decision");
hits("any drafts to review", "draft");
hits("what should I sign off on", "sign off");
hits("what should I sign-off on", "hyphenated sign-off");
hits("anything to authorize", "US spelling");
hits("anything to authorise", "UK spelling");
hits("did you reject that one", "reject");
hits("what are you awaiting from me", "await");

// Turns that are not about the queue must not pay for it — the seed is already
// near the small models' prompt ceiling.
misses("how is orangecat going?", "project status");
misses("who is Elena?", "person lookup");
misses("what did I ship yesterday", "history");
misses("summarise my goals", "goals");

// Guard against over-broad matching: these read as approval-ish but are not, and
// a substring rule like /pend/ would wrongly fire on them.
misses("how much did I spend on subscriptions", "spend is not pending");
misses("append the note to that project", "append is not pending");

// PLANNING_CUES moved here in the same change; pin its behaviour so the move
// cannot have quietly cost the daily brief its trigger.
const plans = (message: string) => {
  assert(PLANNING_CUES.test(message), `should build brief: ${JSON.stringify(message)}`);
  passed += 1;
};
plans("what should I plan for today");
plans("what's urgent");
plans("anything overdue?");
assert(!PLANNING_CUES.test("who is Elena?"), "person lookup must not build a brief");
passed += 1;

console.log(`✓ approval-cues tests passed (${passed} assertions)`);
