import assert from "node:assert/strict";
import { sanitizeActivityPreview, isNoisyProfileActivity } from "../../src/lib/activity-display";
import { mergeDuplicateProjectRows } from "../../src/lib/domain/project-canonical";
import { shortProjectStatus } from "../../src/lib/projects-display";
import { filterProjects, hasProjectAttention, isSiteDown } from "../../src/lib/projects-page-stats";
import type { ProjectGridRow } from "../../src/components/projects/ProjectGridCard";

function row(
  partial: Partial<ProjectGridRow> & Pick<ProjectGridRow, "id" | "name">,
): ProjectGridRow {
  return {
    description: null,
    attrs: {},
    ...partial,
  };
}

assert.equal(sanitizeActivityPreview("gh secret set MY_KEY some-value"), "[redacted]");
assert.equal(sanitizeActivityPreview("hello world"), "hello world");
const long = `Status update: ${"still shipping. ".repeat(12)}`;
assert.ok(sanitizeActivityPreview(long).endsWith("…"));

assert.equal(shortProjectStatus("Production"), "Production");
assert.equal(shortProjectStatus("Strategic planning only - no code, nothing else"), null);
assert.equal(shortProjectStatus("Active development — shipping v2"), "Active development");

assert.equal(isNoisyProfileActivity("custom", "AUTOPILOT BATCH — do NOT idle"), true);
assert.equal(isNoisyProfileActivity("dispatch", "Ship the fix"), false);

const merged = mergeDuplicateProjectRows([
  row({ id: "1", name: "botsmann", attrs: {} }),
  row({ id: "2", name: "Botsmann", description: "Fleet ops", gitUrl: "https://github.com/x/y" }),
]);
assert.equal(merged.length, 1);
assert.equal(merged[0]!.id, "2");

const down = row({ id: "3", name: "site", liveUrl: "https://x.test", siteOk: false });
assert.equal(isSiteDown(down), true);
assert.equal(hasProjectAttention(down), true, "a down site needs attention");
assert.equal(
  hasProjectAttention(row({ id: "4", name: "ok", liveUrl: "https://x.test", siteOk: true })),
  false,
);
assert.equal(hasProjectAttention(row({ id: "5", name: "none" })), false, "no URL is not an alarm");

console.log("✓ projects-display tests passed");

// A project created moments ago sorts first (for a day), after anything that
// needs attention — an alphabetical fold hid a just-added project below 25
// rows right after Add (kaffeeklappe-sep11, 2026-09-11).
{
  const now = Date.now();
  const rows = [
    row({ id: "a", name: "aardvark", createdAt: new Date(now - 30 * 24 * 3600e3) }),
    row({ id: "z", name: "zebra-new", createdAt: new Date(now - 5 * 60e3) }),
    row({ id: "m", name: "middle-new", createdAt: new Date(now - 60 * 60e3) }),
    row({ id: "o", name: "old-no-date" }),
  ];
  const order = filterProjects(rows, "", null).map((r) => r.id);
  assert.deepEqual(
    order,
    ["z", "m", "a", "o"],
    `fresh projects first, newest of them first: ${order}`,
  );
  const stale = filterProjects(
    [
      row({ id: "y", name: "yesterday", createdAt: new Date(now - 2 * 24 * 3600e3) }),
      row({ id: "b", name: "bravo" }),
    ],
    "",
    null,
  ).map((r) => r.id);
  assert.deepEqual(stale, ["b", "y"], "after a day the usual alphabetical order applies");
}
console.log("✓ projects-display: fresh projects sort first");
