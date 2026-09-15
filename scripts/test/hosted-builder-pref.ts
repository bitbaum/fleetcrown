/**
 * The hosted builder preference (lib/constants/statuses.ts + execution-access).
 *
 * "hosted" is a stored preference, not a runner channel: nothing claims it from
 * a PTY queue, so the channel helpers must keep ignoring it while the API and
 * the profile chooser accept it.
 * Run: npx tsx scripts/test/hosted-builder-pref.ts
 */
import assert from "node:assert/strict";
import {
  BUILDER_CHANNELS,
  BUILDER_PREFS,
  HOSTED_BUILDER_PREF,
  isBuilderChannel,
  isHostedBuilderPref,
  DEFAULT_BUILDER_CHANNEL,
} from "@/lib/constants/statuses";
import { pickDispatchChannel } from "@/lib/execution-access";

let pass = 0;
function check(name: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  ✓ ${name}`);
}

check("hosted is a preference the API accepts", () => {
  assert.ok((BUILDER_PREFS as readonly string[]).includes(HOSTED_BUILDER_PREF));
  assert.equal(isHostedBuilderPref("hosted"), true);
  assert.equal(isHostedBuilderPref("cloud"), false);
});

check("hosted is NOT a runner channel — no PTY queue ever claims it", () => {
  assert.equal(isBuilderChannel("hosted"), false);
  assert.ok(!(BUILDER_CHANNELS as readonly string[]).includes("hosted"));
});

check("a hosted project still resolves to the default channel for anything that needs one", () => {
  assert.equal(
    pickDispatchChannel({ builderPref: "hosted", gitUrl: "https://github.com/bitbaum/loki" }),
    DEFAULT_BUILDER_CHANNEL,
  );
});

console.log(`\nhosted-builder-pref: ${pass} passed`);
