// Verifies the derived project health score (src/lib/project-health.ts):
// score = count of passing named checks, every miss names its action.
// Run: npx tsx scripts/test/project-health.ts
import { computeProjectHealth, describeProjectHealth } from "@/lib/project-health";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const full = computeProjectHealth({
  description: "A real project brief.",
  gitUrl: "https://github.com/x/y",
  dirPath: null,
  attrs: {
    mission: "Serve users",
    production_url: "https://example.com",
    status: "production",
    next_step: "Ship the thing",
    definition_of_done: "Tests pass and deployed",
  },
});
eq(full.score, 10, "all facts present → 10/10");
eq(full.max, 10, "max is 10");
eq(describeProjectHealth(full), "10/10", "perfect score has no missing list");

const empty = computeProjectHealth({ description: null, attrs: {} });
eq(empty.score, 3, "empty project keeps only the three no-open-issue points");
eq(empty.checks.filter((c) => !c.pass).every((c) => c.detail.length > 0), true, "every miss names its action");

// An open attention item costs exactly its point and surfaces in the description.
const risky = computeProjectHealth({
  description: "Brief",
  gitUrl: "https://github.com/x/y",
  attrs: {
    mission: "m", production_url: "u", status: "production",
    next_step: "n", definition_of_done: "d",
    security_vulnerability: "Email verification bypass",
  },
});
eq(risky.score, 9, "one open security risk → 9/10");
eq(describeProjectHealth(risky).includes("No security risk"), true, "missing list names the security check");
eq(
  risky.checks.find((c) => c.key === "security_vulnerability")?.detail,
  "Email verification bypass",
  "failing check carries the issue text",
);

// The bulk-import placeholder description does not count as a brief.
const placeholder = computeProjectHealth({
  description: "Local repository imported from fleetcrown-ui",
  attrs: {},
});
eq(placeholder.checks.find((c) => c.key === "brief")?.pass, false, "placeholder brief earns no point");

if (fail === 0) console.log(`✓ project-health: ${pass} checks passed`);
else { console.error(`${fail} failed`); process.exit(1); }
