// The report payload must never lose the part that makes a report routable.
//
// window.FleetCrown.report() lets a host page file a bug with the error already
// described and the machine-readable context attached. The ingest caps
// `suggestion` at 2000 chars, so prose and diagnostics compete for one budget.
// The rule this file pins down: diagnostics are budgeted FIRST. A clipped
// sentence still reads; a clipped error code turns a self-routing report back
// into a human triage job, which is the whole thing the API exists to avoid.
// Run: npx tsx scripts/test/widget-report-payload.ts
import {
  buildSuggestion,
  formatDiagnostics,
  DIAGNOSTICS_HEADING,
} from "../../widget/report-payload";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; }
  else { fail++; console.error(`✗ ${label}`); }
}

const MAX = 2000;
const diag = { code: "cat_permission_denied", action: "update_product", category: "entities" };

// ---- formatDiagnostics ----
ok(
  formatDiagnostics(diag) === "code: cat_permission_denied\naction: update_product\ncategory: entities",
  "renders one key: value line per entry",
);
ok(
  formatDiagnostics({ a: "1", b: undefined, c: null, d: "", e: 0, f: false }) === "a: 1\ne: 0\nf: false",
  "drops undefined/null/empty but keeps falsy 0 and false",
);
ok(formatDiagnostics({}) === "", "empty diagnostics render as empty string");

// ---- buildSuggestion: the happy path ----
const short = buildSuggestion("Cat could not update my product.", diag, MAX);
ok(short.startsWith("Cat could not update my product."), "prose leads the submission");
ok(short.includes(DIAGNOSTICS_HEADING), "diagnostics block is delimited");
ok(short.includes("code: cat_permission_denied"), "error code survives");
ok(short.length <= MAX, "stays within the ingest cap");

// ---- buildSuggestion: no diagnostics ----
ok(
  buildSuggestion("  just prose  ", null, MAX) === "just prose",
  "without diagnostics the prose is trimmed and passed through",
);
ok(
  !buildSuggestion("prose", {}, MAX).includes(DIAGNOSTICS_HEADING),
  "diagnostics that render empty add no heading",
);

// ---- buildSuggestion: the case the rule exists for ----
const huge = buildSuggestion("x".repeat(MAX * 2), diag, MAX);
ok(huge.length === MAX, "over-long prose is cut to exactly the cap");
ok(huge.includes("code: cat_permission_denied"), "error code survives prose overflow");
ok(huge.includes("category: entities"), "the LAST diagnostic line survives too");
ok(huge.endsWith("category: entities"), "diagnostics sit at the end, uncut");

// A diagnostics block larger than the whole budget must not throw or produce
// a negative slice — the prose simply disappears.
const overflowing = buildSuggestion("prose", { blob: "y".repeat(5000) }, 120);
ok(overflowing.length === 120, "an oversized diagnostics block still respects the cap");
ok(!overflowing.startsWith("prose"), "prose yields the budget to diagnostics, not the reverse");

if (fail > 0) {
  console.error(`widget-report-payload: ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`widget-report-payload: ${pass} checks passed`);
