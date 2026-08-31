// Self-test for the deterministic evidence pre-check.
// Run: npx tsx scripts/test/evidence-precheck.ts
import { precheckEvidence, EVIDENCE_PRECHECK_ID } from "@/lib/orchestration/evidence-precheck";
import type { OrchestrationTaskSummary } from "@/lib/orchestration/contract";

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

/** The bar actually in force on prod for 46 of 51 graded runs (2026-08-07). */
const REAL_BAR =
  "`npm run verify` passes, with its real output in the handoff (lint:/tsc:/tests:). " +
  "Work is committed and pushed. A check that genuinely cannot run is recorded verbatim.";

const summary = (over: Partial<OrchestrationTaskSummary> = {}): OrchestrationTaskSummary => ({
  done: "did the thing",
  next: "",
  tests: "",
  todos: "0",
  health: "good",
  ...over,
});

// ── The dominant real-world case: agent claims done, evidences nothing ──────
const empty = precheckEvidence(REAL_BAR, summary());
ok("real bar + blank handoff → fires", empty !== null);
ok("names every demanded field", empty?.missing.length === 4);
ok("gapCode is stable and groupable", empty?.gapCode === "evidence:lint+tsc+tests+commit");
ok(
  "gap text is non-empty and actionable",
  !!empty?.gap && empty.gap.includes("Definition of Done"),
);

// ── Compliance defers to the model judge (the pre-check never approves) ─────
const full = precheckEvidence(
  REAL_BAR,
  summary({
    tests: "12 pass · 0 fail",
    tsc: "clean",
    lint: "0 errors",
    commit: "a1b2c3d pushed",
  }),
);
ok("fully evidenced handoff → defers to the judge (null)", full === null);

// ── An honest impossibility IS compliance, per the handoff contract ─────────
const honest = precheckEvidence(
  REAL_BAR,
  summary({
    tests: "no suite",
    tsc: "clean",
    lint: "0 errors",
    commit: "a1b2c3d pushed",
  }),
);
ok('"no suite" counts as evidenced — never punished for honesty', honest === null);

// ── Only what the bar asks for is demanded ─────────────────────────────────
const lintOnly = precheckEvidence("Linting passes.", summary({ lint: "" }));
ok("bar naming only lint → demands only lint", lintOnly?.gapCode === "evidence:lint");
const noLint = precheckEvidence("Tests pass.", summary({ tests: "3 pass", lint: "" }));
ok("bar silent on lint → blank lint is not a gap", noLint === null);

// ── `verify` bundles lint+tsc+tests, but NOT commit (pushing is separate) ───
const verifyOnly = precheckEvidence(
  "`npm run verify` passes.",
  summary({
    tests: "3 pass",
    tsc: "clean",
    lint: "clean",
  }),
);
ok("verify bundle satisfied without commit → no gap", verifyOnly === null);
const verifyBlank = precheckEvidence("`npm run verify` passes.", summary());
ok("verify bundle expands to lint+tsc+tests", verifyBlank?.gapCode === "evidence:lint+tsc+tests");

// ── Degenerate inputs fail safe (defer, never fabricate a rejection) ────────
ok("no bar → null", precheckEvidence("", summary()) === null);
ok("null bar → null", precheckEvidence(null, summary()) === null);
ok(
  "undefined summary + real bar → still fires (nothing evidenced)",
  precheckEvidence(REAL_BAR, undefined) !== null,
);
ok(
  "whitespace-only field counts as blank",
  precheckEvidence("Linting passes.", summary({ lint: "   " })) !== null,
);

// ── Identity used when recording who decided ───────────────────────────────
ok("precheck id is not a model name", EVIDENCE_PRECHECK_ID === "precheck:evidence");

console.log(`\n${fail === 0 ? "✓" : "✗"} evidence-precheck: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
