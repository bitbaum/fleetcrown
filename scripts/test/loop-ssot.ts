/**
 * Regression checks for autonomous loop entrypoints.
 * Run: npx tsx scripts/test/loop-ssot.ts
 */
import fs from "node:fs";
import assert from "node:assert/strict";

const nudgeIdle = fs.readFileSync("src/app/api/crons/nudge-idle/route.ts", "utf8");
assert.match(nudgeIdle, /injectPrompt\(\{\s*tab:\s*proj\.name,\s*promptKey:\s*"next_best"/s);
assert.doesNotMatch(nudgeIdle, /db\.insert\(pendingCommands\)\.values/);
assert.match(nudgeIdle, /no_path/);

const fleetKick = fs.readFileSync("src/lib/fleet-kick.ts", "utf8");
assert.match(fleetKick, /injectPrompt\(\{\s*tab:\s*projectKey,\s*promptKey:\s*"next_best"/s);
assert.match(fleetKick, /reason:\s*"no_path"/);

console.log("✓ loop SSOT checks passed");
