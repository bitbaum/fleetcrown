// Self-test for the definition-of-done stop-gate decision (pure part).
// Run: npx tsx scripts/test/dod-gate.ts
import { applyDoDGate } from "@/lib/orchestration/dod-gate";
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

console.log(`\n${fail === 0 ? "✓" : "✗"} dod-gate: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
