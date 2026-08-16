/**
 * Inline tests for dispatch channel routing.
 * Run: npx tsx scripts/test/builder-channel-routing.ts
 *
 * The invariant under test: a queued command must always name the builder that
 * will run it. The claim gate (db/queries/pending-commands.ts) reads
 *
 *     payload->>'channel' IS NULL OR payload->>'channel' = <mine>
 *
 * so a command with NO channel is claimable by EVERY connected runner at once.
 * That is a race, and the always-on box-runner loses it to whichever desktop
 * happens to be polling — after which closing the laptop lid kills the work the
 * laptop had just claimed. Two call sites used to pass `null` as the fallback
 * while their comments claimed they matched the cloud-defaulting branch.
 *
 * These assertions pin the closed side: not "cloud is usually chosen" but
 * "a channel is ALWAYS chosen". If someone widens the return type back to
 * include null/undefined, the never-unrouted case below fails.
 */
import { projectPreferredChannel } from "@/lib/execution-access";
import { BUILDER_CHANNELS, DEFAULT_BUILDER_CHANNEL } from "@/lib/constants/statuses";

const CLONEABLE = "https://github.com/maonakamoto/fleetcrown.git";

// The default itself must be a real channel, not a typo'd string that would
// silently never match a polling runner.
if (!(BUILDER_CHANNELS as readonly string[]).includes(DEFAULT_BUILDER_CHANNEL)) {
  throw new Error(`DEFAULT_BUILDER_CHANNEL ${DEFAULT_BUILDER_CHANNEL} is not a BUILDER_CHANNEL`);
}

// The always-on box is the default target: that is the whole point of having a
// server-side runner. A cloneable repo can be materialized anywhere, so nothing
// forces it back to the desktop.
if (projectPreferredChannel({ dirPath: "/home/g/dev/fleetcrown", gitUrl: CLONEABLE }) !== DEFAULT_BUILDER_CHANNEL) {
  throw new Error("cloneable project must take the default channel");
}
if (projectPreferredChannel({ gitUrl: CLONEABLE }) !== DEFAULT_BUILDER_CHANNEL) {
  throw new Error("repo-only project must take the default channel");
}
if (projectPreferredChannel(null) !== DEFAULT_BUILDER_CHANNEL) {
  throw new Error("absent project must take the default channel");
}
if (projectPreferredChannel(undefined) !== DEFAULT_BUILDER_CHANNEL) {
  throw new Error("undefined project must take the default channel");
}

// Locus is a property of the task: a directory that exists on exactly one
// machine, with no repo to clone, can only run there. The cloud builder would
// clone-fail and invent an empty workspace (the 2026-07-14 misroute).
if (projectPreferredChannel({ dirPath: "/home/g/dev/scratch", gitUrl: null }) !== "local") {
  throw new Error("dirPath-only project must pin to local");
}
if (projectPreferredChannel({ dirPath: "/home/g/dev/scratch" }) !== "local") {
  throw new Error("dirPath with absent gitUrl must pin to local");
}
if (projectPreferredChannel({ dirPath: "/home/g/dev/scratch", gitUrl: "not-a-url" }) !== "local") {
  throw new Error("dirPath with uncloneable gitUrl must pin to local");
}

// A caller with a specific reason may still override the default — but the
// forced-local case outranks it, because that one is physics, not preference.
if (projectPreferredChannel({ gitUrl: CLONEABLE }, "local") !== "local") {
  throw new Error("explicit fallback must be honored");
}
if (projectPreferredChannel({ dirPath: "/home/g/dev/scratch", gitUrl: null }, "cloud") !== "local") {
  throw new Error("uncloneable project must override an explicit cloud fallback");
}

// The regression gate. Every shape — including the empty object and the
// half-populated rows real user_projects rows produce — must yield a usable
// channel. `null` here would mean "contested by all runners".
const SHAPES = [
  null,
  undefined,
  {},
  { dirPath: null, gitUrl: null },
  { dirPath: "", gitUrl: "" },
  { dirPath: "/x" },
  { gitUrl: CLONEABLE },
  { dirPath: "/x", gitUrl: CLONEABLE },
  { dirPath: "/x", gitUrl: "git@github.com:maonakamoto/fleetcrown.git" },
];
for (const shape of SHAPES) {
  const channel = projectPreferredChannel(shape);
  if (!channel || !(BUILDER_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`unrouted dispatch for ${JSON.stringify(shape)} — got ${JSON.stringify(channel)}`);
  }
}

console.log("✓ builder channel routing");
