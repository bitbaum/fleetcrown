import assert from "node:assert/strict";
import {
  composerChips,
  fillSuggestedAction,
  LOKI_IMPORT_PROJECT_HREF,
  LOKI_NEW_PROJECT_HREF,
  LOKI_SCOPED_CHIPS,
} from "../../src/config/loki-suggested-actions";

assert.equal(fillSuggestedAction("move forward on {project}", "datacat"), "move forward on datacat");
assert.equal(fillSuggestedAction("code review for {project}", "kivvi"), "code review for kivvi");
assert.equal(fillSuggestedAction("move forward on {project}", null), "move forward");
assert.equal(fillSuggestedAction("next best for {project}", null), "next best");
assert.equal(fillSuggestedAction("fix types and tests for {project}", null), "fix types and tests");

const none = composerChips({ projectCount: 0, selectedProjects: [] });
assert.deepEqual(
  none.map((c) => c.id),
  ["new_project", "import_project"],
  "zero projects: start or import — nothing to dispatch",
);
assert.equal(none[0].href, LOKI_NEW_PROJECT_HREF);
assert.equal(none[1].href, LOKI_IMPORT_PROJECT_HREF);
assert.ok(none.every((c) => c.kind !== "send" || c.chatOnly), "no unscoped dispatch when the fleet is empty");

const unscoped = composerChips({ projectCount: 4, selectedProjects: [] });
assert.deepEqual(
  unscoped.map((c) => c.id),
  ["new_project", "open_project", "attention"],
  "fleet, no scope: new / open / what needs me",
);
assert.equal(unscoped.length, 3);
assert.ok(!unscoped.some((c) => c.id === "move_forward"), "dispatch chips stay hidden until a project is picked");
assert.equal(unscoped.find((c) => c.id === "attention")?.chatOnly, true);

const scoped = composerChips({ projectCount: 4, selectedProjects: ["fleetcrown"] });
assert.deepEqual(
  scoped.map((c) => c.id),
  LOKI_SCOPED_CHIPS.map((c) => c.id),
);
assert.equal(scoped.length, 3);
assert.ok(scoped.every((c) => c.kind === "send" && !c.chatOnly));

const withGoal = composerChips({
  projectCount: 4,
  selectedProjects: ["HamsterCheek"],
  selectedGoal: { title: "Integrate the lock" },
});
assert.equal(withGoal.length, 3);
assert.equal(withGoal[0].id, "active_goal");
assert.ok(withGoal[0].template?.includes("HamsterCheek"));
assert.ok(withGoal[0].template?.includes("Integrate the lock"));
assert.deepEqual(
  withGoal.slice(1).map((c) => c.id),
  ["quality", "test_and_fix"],
);

const many = composerChips({ projectCount: 4, selectedProjects: ["a", "b"] });
assert.deepEqual(
  many.map((c) => c.id),
  ["move_forward_many", "quality_many", "test_and_fix_many"],
);
assert.ok(many.every((c) => c.template && !c.template.includes("{project}")));

console.log("✓ loki-suggested-actions tests passed");
