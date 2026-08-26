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
  ["today", "loki", "control", "projects", "feedback"],
  "Work is the five daily surfaces — destinations do not share that seat. " +
    "Feedback earned the seat 2026-08-24: an inbox is opened with no context, " +
    "and burying inbound reports under Control/Projects is how they went unseen.",
);

for (const id of ["terminal", "approvals", "prompts", "activity", "system", "thoughts"] as const) {
  assert.ok(
    more.items.some((i) => i.id === id),
    `${id} stays reachable under More`,
  );
  assert.ok(
    NAV_ITEMS.some((i) => i.id === id),
    `${id} stays in NAV_ITEMS (palette + titles)`,
  );
}

const listed = new Set(SIDEBAR_SECTIONS.flatMap((s) => s.items.map((i) => i.id)));
assert.equal(listed.has("agents"), false, "Agents is Control, not a nav peer");
assert.equal(listed.has("atlas"), false, "Atlas is Projects, not a nav peer");
assert.ok(NAV.agents && NAV.atlas, "retired routes stay named so redirects stay honest");

assert.ok(
  FLEET_SURFACES.some((s) => s.id === "terminal"),
  "Terminal stays a project-scoped fleet tab",
);

assert.equal(
  new Set(SIDEBAR_SECTIONS.flatMap((s) => s.items.map((i) => i.id))).size,
  SIDEBAR_SECTIONS.flatMap((s) => s.items).length,
  "no nav item is listed in two sections",
);

const priv = SIDEBAR_SECTIONS.find((s) => s.id === "private");
assert.ok(priv, "private section exists");
assert.ok(priv.private, "private section is PIN-gated");
assert.ok(
  priv.items.some((i) => i.id === "people"),
  "People stays in the private book",
);
assert.ok(
  priv.items.some((i) => i.id === "robots"),
  "Robots sit next to People — same book, different law",
);
assert.equal(NAV.robots.href, "/robots", "Robots has its own route");
assert.equal(NAV.people.href, "/people", "People is not mixed with robots");
assert.ok(
  priv.items.some((i) => i.id === "crew"),
  "Crew is PIN-gated with People — its roster IS the address book, and an " +
    "assignment leaves the private zone only through a share link",
);
assert.equal(NAV.crew.href, "/crew", "Crew has its own route");

console.log("✓ navigation IA tests passed");
