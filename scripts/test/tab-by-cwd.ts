/**
 * The regression these pin: /control showed "focus_tab -> orangecat failed:
 * tab not found: orangecat" for a session that was open the whole time, in a
 * tab named "Tab #9". Name matching cannot recover from that; cwd matching can.
 */
import assert from "node:assert/strict";
import {
  cwdBelongsToProject,
  findPaneForProject,
  resolveTabByRunningAgent,
  type PaneCandidate,
} from "../../src/lib/terminals/tab-by-cwd";

function proc(over: Partial<PaneCandidate> & { cwd: string; pid: number }): PaneCandidate {
  return { zellijPaneId: 1, zellijSession: "main", ...over };
}

// --- cwdBelongsToProject -----------------------------------------------
assert.ok(cwdBelongsToProject("/home/g/dev/orangecat", "orangecat"));
assert.ok(
  cwdBelongsToProject("/home/g/dev/fleetcrown/.claude/worktrees/control-redesign", "fleetcrown"),
  "a worktree nested under the repo still belongs to the repo",
);
assert.ok(
  cwdBelongsToProject("/home/g/dev/aoz-housing", "aozhousing"),
  "punctuation collapses — same normalizer as tab-name matching",
);
assert.ok(cwdBelongsToProject("/home/g/dev/AOZ Housing/src", "aoz-housing"), "case collapses too");
assert.ok(!cwdBelongsToProject("/home/g/dev/orangecat", "fleetcrown"));
assert.ok(!cwdBelongsToProject("/home/g/dev/orangecat", ""), "an empty key matches nothing");
assert.ok(
  !cwdBelongsToProject("/home/g/dev/orangecat-legacy", "orangecat"),
  "a sibling directory is not the project — segments compare whole, not by prefix",
);

// --- findPaneForProject ------------------------------------------------
assert.equal(findPaneForProject("orangecat", []), null);
assert.equal(
  findPaneForProject("orangecat", [proc({ cwd: "/home/g/dev/orangecat", pid: 10, zellijPaneId: undefined })]),
  null,
  "a process outside zellij has no pane to focus",
);
assert.equal(
  findPaneForProject("orangecat", [proc({ cwd: "/home/g/dev/orangecat", pid: 10, zellijSession: undefined })]),
  null,
  "pane ids are only unique within a session — no session, no target",
);

// Deterministic tie-break: repo root beats a worktree beneath it, and the
// answer must not depend on /proc iteration order.
const many = [
  proc({ cwd: "/home/g/dev/orangecat/.claude/worktrees/b", pid: 30, zellijPaneId: 7 }),
  proc({ cwd: "/home/g/dev/orangecat", pid: 20, zellijPaneId: 5 }),
  proc({ cwd: "/home/g/dev/orangecat/.claude/worktrees/a", pid: 10, zellijPaneId: 6 }),
];
assert.equal(findPaneForProject("orangecat", many)?.pid, 20, "shortest cwd (the repo root) wins");
assert.equal(
  findPaneForProject("orangecat", [...many].reverse())?.pid,
  20,
  "same winner regardless of scan order",
);
assert.equal(
  findPaneForProject("orangecat", [
    proc({ cwd: "/home/g/dev/orangecat/.claude/worktrees/b", pid: 30 }),
    proc({ cwd: "/home/g/dev/orangecat/.claude/worktrees/a", pid: 10 }),
  ])?.pid,
  10,
  "equal-length cwds break by lowest pid, not by order",
);

// --- resolveTabByRunningAgent ------------------------------------------
const map = (session: string) =>
  session === "main" ? new Map([[5, "Tab #9"]]) : new Map<number, string>();

assert.deepEqual(
  resolveTabByRunningAgent("orangecat", [proc({ cwd: "/home/g/dev/orangecat", pid: 20, zellijPaneId: 5 })], map),
  { session: "main", tab: "Tab #9" },
  "THE regression: a default-named tab resolves, where name matching returned nothing",
);
assert.equal(
  resolveTabByRunningAgent("orangecat", [], map),
  null,
  "nothing running is a genuine 'not open' — a different problem than 'open but misnamed'",
);
assert.equal(
  resolveTabByRunningAgent(
    "orangecat",
    [proc({ cwd: "/home/g/dev/orangecat", pid: 20, zellijPaneId: 99 })],
    map,
  ),
  null,
  "a pane missing from zellij's own map yields null, never a wrong tab",
);

console.log("✓ tab-by-cwd tests passed");
