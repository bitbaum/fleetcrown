/**
 * Inline tests for fleet-kick helpers and Loki NL detection.
 * Run: npm run test:fleet-kick
 */
import assert from "node:assert/strict";
import { sortProjectsForKick } from "@/lib/fleet-kick";
import { isDevelopAllFleetRequest } from "@/lib/loki-fleet-commands";
import { resolveDispatchTargets } from "@/lib/loki/dispatch-targets";
import {
  shouldDispatchScreenshot,
  isDefaultVisionQuestion,
  isScreenshotImplementIntent,
} from "@/lib/loki/screenshot-dispatch";
import type { CommandResolution } from "@/lib/command-resolve";

function testSortProjectsForKick() {
  const ready = new Set(["beta", "alpha"]);
  const sorted = sortProjectsForKick(["zeta", "alpha", "beta", "gamma"], ready);
  assert.deepEqual(sorted, ["alpha", "beta", "gamma", "zeta"]);
}

function testDevelopAllFleetPhrases() {
  assert.equal(isDevelopAllFleetRequest("develop all my projects"), true);
  assert.equal(isDevelopAllFleetRequest("build the whole fleet"), true);
  assert.equal(isDevelopAllFleetRequest("start every project"), true);
  assert.equal(isDevelopAllFleetRequest("code review for fleetcrown"), false);
  assert.equal(isDevelopAllFleetRequest("next best for fleetcrown"), false);
}

function testDispatchTargets() {
  const resolution = (partial: Partial<CommandResolution>): CommandResolution => ({
    kind: "command",
    projectKey: null,
    intentId: "quality",
    prompt: "code review",
    needsProject: false,
    reason: "test",
    ...partial,
  });

  assert.deepEqual(
    resolveDispatchTargets({
      resolution: resolution({ projectKey: "a" }),
      selectedProjects: ["b", "c"],
      namedInText: null,
    }),
    ["b", "c"],
  );

  assert.deepEqual(
    resolveDispatchTargets({
      resolution: resolution({ projectKey: "a" }),
      selectedProjects: ["b", "c"],
      namedInText: "a",
    }),
    ["a"],
  );
}

function testScreenshotDispatch() {
  assert.equal(shouldDispatchScreenshot("What's wrong here and what should we change?", true, "fleetcrown"), true);
  assert.equal(shouldDispatchScreenshot("implement this ui", true, "fleetcrown"), true);
  assert.equal(shouldDispatchScreenshot("what do you think?", true, "fleetcrown"), false);
  assert.equal(shouldDispatchScreenshot("implement this", true, null), false);
  assert.equal(isDefaultVisionQuestion("What's wrong here and what should we change?"), true);
  assert.equal(isScreenshotImplementIntent("please implement the layout"), true);
}

testSortProjectsForKick();
testDevelopAllFleetPhrases();
testDispatchTargets();
testScreenshotDispatch();

console.log("✓ fleet-kick helper tests passed");
