import assert from "node:assert/strict";
import {
  FLEET_SURFACES,
  NAV,
  NAV_ITEMS,
  SIDEBAR_SECTIONS,
} from "../../src/config/navigation";

const work = SIDEBAR_SECTIONS.find((s) => s.id === "work");
const more = SIDEBAR_SECTIONS.find((s) => s.id === "more");
assert.ok(work, "work section exists");
assert.ok(more, "more section exists");

assert.deepEqual(
  work.items.map((i) => i.id),
  ["today", "loki", "control", "projects"],
  "Work is the four daily surfaces — destinations do not share that seat",
);

for (const id of ["terminal", "agents", "atlas", "approvals", "prompts", "activity", "system", "thoughts"] as const) {
  assert.ok(
    more.items.some((i) => i.id === id),
    `${id} stays reachable under More`,
  );
  assert.ok(
    NAV_ITEMS.some((i) => i.id === id),
    `${id} stays in NAV_ITEMS (palette + titles)`,
  );
  assert.ok(NAV[id], `${id} route is not deleted`);
}

assert.ok(
  FLEET_SURFACES.some((s) => s.id === "terminal"),
  "Terminal stays a project-scoped fleet tab",
);

assert.equal(
  new Set(SIDEBAR_SECTIONS.flatMap((s) => s.items.map((i) => i.id))).size,
  SIDEBAR_SECTIONS.flatMap((s) => s.items).length,
  "no nav item is listed in two sections",
);

console.log("✓ navigation IA tests passed");
