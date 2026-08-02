// Self-test for the definition-of-done stop-gate decision (pure part).
// Run: npx tsx scripts/test/dod-gate.ts
import { applyDoDGate, DEFAULT_GOAL_MAX_TURNS } from "@/lib/orchestration/dod-gate";
import { ESCALATION_HUMAN_STREAK } from "@/lib/orchestration/escalation-ladder";
import type { RunClosePatch } from "@/lib/orchestration/close-from-session";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const base = (outcome: RunClosePatch["outcome"]): RunClosePatch => ({
  state: outcome === "error" ? "error" : "done",
  outcome,
  summary: { done: "did the thing", next: "" } as RunClosePatch["summary"],
  finishedAt: new Date(0),
});

// 1. success + met → unchanged
const r1 = applyDoDGate(base("success"), { met: true, gap: "" });
ok("success + DoD met → stays success", r1.outcome === "success");

// 2. success + NOT met → downgraded to partial, gap surfaced in next
const r2 = applyDoDGate(base("success"), { met: false, gap: "tests not run" });
ok("success + DoD unmet → partial", r2.outcome === "partial");
ok("success + DoD unmet → gap written to next", typeof r2.summary.next === "string" && r2.summary.next.includes("tests not run"));
ok("success + DoD unmet → next signals not-done", r2.summary.next!.toLowerCase().includes("not yet met"));

// 3. partial + NOT met → unchanged (only gates success)
const r3 = applyDoDGate(base("partial"), { met: false, gap: "x" });
ok("partial + DoD unmet → stays partial (not re-gated)", r3.outcome === "partial");

// 4. error + NOT met → unchanged
const r4 = applyDoDGate(base("error"), { met: false, gap: "x" });
ok("error + DoD unmet → stays error", r4.outcome === "error");

// 5. empty gap still produces an actionable next
const r5 = applyDoDGate(base("success"), { met: false, gap: "" });
ok("success + DoD unmet + empty gap → still has actionable next", !!r5.summary.next && r5.summary.next.length > 10);

// ── Turn cap (goal-mode) ─────────────────────────────────────────────────────
// 6. under the cap → still downgrades (loop continues)
const r6 = applyDoDGate(base("success"), { met: false, gap: "flaky" }, { maxTurns: 3, priorPartials: 1 });
ok("unmet + under cap → still downgrades to partial", r6.outcome === "partial");

// 7. AT the cap → stops downgrading (keeps success so the loop halts) + flags it
const r7 = applyDoDGate(base("success"), { met: false, gap: "flaky" }, { maxTurns: 3, priorPartials: 3 });
ok("unmet + at cap → keeps success (loop halts)", r7.outcome === "success");
ok("unmet + at cap → next records the cap + escalation", !!r7.summary.next && r7.summary.next.toLowerCase().includes("after 3 attempt"));

// 8. cap set but goal MET → unchanged success (cap never engages)
const r8 = applyDoDGate(base("success"), { met: true, gap: "" }, { maxTurns: 3, priorPartials: 5 });
ok("met + over cap → stays success, no cap note", r8.outcome === "success" && !r8.summary.next);

// 9. no cap (maxTurns null) → loops forever. Reachable ONLY via an explicit
// goal_max_turns=0 now that the default is bounded; see DEFAULT_GOAL_MAX_TURNS.
const r9 = applyDoDGate(base("success"), { met: false, gap: "x" }, { maxTurns: null, priorPartials: 99 });
ok("unmet + explicit no-cap → downgrades forever (opt-in only)", r9.outcome === "partial");

// 10. The default bound exists and is the ladder's human rung — an unbounded
// goal loop is invisible to the failure brake AND the escalation ladder
// (a partial streak is not a failure streak), so "loop forever" must not be
// what a project gets by saying nothing.
ok("default goal cap is bounded", Number.isFinite(DEFAULT_GOAL_MAX_TURNS) && DEFAULT_GOAL_MAX_TURNS > 0);
ok("default goal cap is SSOT'd to the ladder's human rung", DEFAULT_GOAL_MAX_TURNS === ESCALATION_HUMAN_STREAK);

// 11. A project that has been looping at the default cap stops looping.
const r11 = applyDoDGate(
  base("success"),
  { met: false, gap: "five integrity layers still missing" },
  { maxTurns: DEFAULT_GOAL_MAX_TURNS, priorPartials: DEFAULT_GOAL_MAX_TURNS },
);
ok("unmet at default cap → stops looping (success, flagged)", r11.outcome === "success");
ok(
  "capped close names the gap so the human alert is actionable",
  !!r11.summary.next && r11.summary.next.includes("five integrity layers still missing"),
);

console.log(`\n${fail === 0 ? "✓" : "✗"} dod-gate: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
