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
 * That is a race, and it is won by whichever runner polls first — after which
 * closing the laptop lid kills the work that laptop had just claimed.
 *
 * These assertions pin the closed side: not "channel X is usually chosen" but
 * "a channel is ALWAYS chosen". If someone widens the return type back to
 * include null/undefined, the never-unrouted cases below fail.
 *
 * The routing rule is two-tiered, and both tiers are STORED — nothing here
 * reads runner presence:
 *
 *   1. lock — physics. Only one builder can materialize this project.
 *   2. pref — the project's `builder_pref` row, else the cloud floor.
 *
 * Presence used to be a tier ("operator present → laptop"). Every misroute this
 * subsystem shipped came from that inference, so the negative tests below pin
 * that the SAME project routes the SAME way whatever is online.
 */
import {
  projectPreferredChannel,
  projectChannelLock,
  pickDispatchChannel,
} from "@/lib/execution-access";
import { BUILDER_CHANNELS, DEFAULT_BUILDER_CHANNEL } from "@/lib/constants/statuses";

const CLONEABLE = "https://github.com/bitbaum/fleetcrown.git";
const LOCKED = { dirPath: "/home/g/dev/scratch", gitUrl: null };
const PORTABLE = { dirPath: "/home/g/dev/fleetcrown", gitUrl: CLONEABLE };
const REPO_ONLY = { gitUrl: CLONEABLE };

// The default itself must be a real channel, not a typo'd string that would
// silently never match a polling runner — and it must be the always-on box.
if (!(BUILDER_CHANNELS as readonly string[]).includes(DEFAULT_BUILDER_CHANNEL)) {
  throw new Error(`DEFAULT_BUILDER_CHANNEL ${DEFAULT_BUILDER_CHANNEL} is not a BUILDER_CHANNEL`);
}
if (DEFAULT_BUILDER_CHANNEL !== "cloud") {
  throw new Error("the floor is the always-on box; local is a stored per-project choice");
}

// ── Floor: nothing stored → cloud ───────────────────────────────────────────
if (projectPreferredChannel(PORTABLE) !== "cloud") {
  throw new Error("cloneable project with a laptop tree still defaults to cloud");
}
if (projectPreferredChannel(REPO_ONLY) !== "cloud") {
  throw new Error("repo-only project must take the cloud floor");
}
if (projectPreferredChannel(null) !== "cloud") throw new Error("absent project → cloud");
if (projectPreferredChannel(undefined) !== "cloud") throw new Error("undefined project → cloud");

// ── Lock: physics outranks everything ───────────────────────────────────────
// A directory that exists on exactly one machine, with no repo to clone, can
// only run there. The cloud builder would clone-fail and invent an empty
// workspace (the 2026-07-14 misroute).
if (projectPreferredChannel(LOCKED) !== "local") throw new Error("dirPath-only pins to local");
if (projectPreferredChannel({ dirPath: "/home/g/dev/scratch" }) !== "local") {
  throw new Error("dirPath with absent gitUrl must pin to local");
}
if (projectPreferredChannel({ dirPath: "/home/g/dev/scratch", gitUrl: "not-a-url" }) !== "local") {
  throw new Error("dirPath with uncloneable gitUrl must pin to local");
}
if (projectPreferredChannel({ ...LOCKED, builderPref: "cloud" }) !== "local") {
  throw new Error("a stored cloud preference cannot move a laptop-only tree to the cloud");
}
if (projectPreferredChannel(LOCKED, "cloud") !== "local") {
  throw new Error("uncloneable project must override an explicit cloud fallback");
}

// ── Stored preference: the operator's decision, honored verbatim ────────────
if (projectPreferredChannel({ ...PORTABLE, builderPref: "local" }) !== "local") {
  throw new Error("builder_pref=local must route local");
}
if (projectPreferredChannel({ ...REPO_ONLY, builderPref: "local" }) !== "local") {
  throw new Error("a repo-only project may still be pinned to the laptop by its row");
}
if (projectPreferredChannel({ ...PORTABLE, builderPref: "cloud" }) !== "cloud") {
  throw new Error("builder_pref=cloud must route cloud");
}
// Garbage in the column is not a channel and must not become one.
for (const junk of ["", "  ", "laptop", "CLOUD", "null"]) {
  if (projectPreferredChannel({ ...PORTABLE, builderPref: junk }) !== "cloud") {
    throw new Error(`unknown builder_pref ${JSON.stringify(junk)} must fall to the floor`);
  }
}
// The pref beats an explicit caller fallback: the row is the operator's word.
if (projectPreferredChannel({ ...PORTABLE, builderPref: "local" }, "cloud") !== "local") {
  throw new Error("stored preference outranks a caller fallback");
}
// Without a pref, an explicit fallback is honored.
if (projectPreferredChannel(REPO_ONLY, "local") !== "local") {
  throw new Error("explicit fallback must be honored when the row says nothing");
}

// ── Box-rooted checkouts are the box's (lock in the other direction) ────────
const BOX_ROOT = "/srv/box-dev";
const BOX_PROJECT = { dirPath: `${BOX_ROOT}/velokiosk-sep10`, gitUrl: CLONEABLE };
const prevBoxRoot = process.env.FLEETCROWN_BOX_DEV_ROOT;
process.env.FLEETCROWN_BOX_DEV_ROOT = `${BOX_ROOT}/`;
if (projectChannelLock(BOX_PROJECT) !== "cloud")
  throw new Error("lock: box-rooted dirPath is cloud");
if (pickDispatchChannel({ ...BOX_PROJECT, builderPref: "local" }) !== "cloud")
  throw new Error("a box-rooted checkout cannot be pinned to the laptop by its row");
if (projectChannelLock({ dirPath: `${BOX_ROOT}-other/x`, gitUrl: CLONEABLE }) !== null)
  throw new Error("lock: a sibling prefix is not under the box root");
if (projectChannelLock({ dirPath: `${BOX_ROOT}/only-here`, gitUrl: null }) !== "cloud")
  throw new Error("lock: box-rooted without a git url is still the box's");
delete process.env.FLEETCROWN_BOX_DEV_ROOT;
if (projectChannelLock(BOX_PROJECT) !== null)
  throw new Error("lock: without an explicit box root, nothing is box-rooted (laptop dev)");
if (prevBoxRoot !== undefined) process.env.FLEETCROWN_BOX_DEV_ROOT = prevBoxRoot;
if (projectChannelLock(LOCKED) !== "local") throw new Error("lock: dirPath-only is local");
if (projectChannelLock(PORTABLE) !== null) throw new Error("lock: cloneable is unlocked");
if (projectChannelLock(null) !== null) throw new Error("lock: absent project is unlocked");

// ── pickDispatchChannel IS projectPreferredChannel with the floor ────────────
// One rule, one answer. The two names exist because callers with a specific
// fallback (executor.ts on the cloud host) and callers without one used to
// call different code; they must never diverge again.
const SHAPES = [
  null,
  undefined,
  {},
  { dirPath: null, gitUrl: null },
  { dirPath: "", gitUrl: "" },
  { dirPath: "/x" },
  { gitUrl: CLONEABLE },
  { dirPath: "/x", gitUrl: CLONEABLE },
  { dirPath: "/x", gitUrl: "git@github.com:bitbaum/fleetcrown.git" },
  { gitUrl: CLONEABLE, builderPref: "local" },
  { gitUrl: CLONEABLE, builderPref: "cloud" },
  { dirPath: "/x", gitUrl: CLONEABLE, builderPref: "local" },
  { dirPath: "/x", gitUrl: CLONEABLE, builderPref: "nonsense" },
];
for (const shape of SHAPES) {
  const channel = pickDispatchChannel(shape);
  if (!channel || !(BUILDER_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(
      `unrouted dispatch for ${JSON.stringify(shape)} — got ${JSON.stringify(channel)}`,
    );
  }
  if (channel !== projectPreferredChannel(shape)) {
    throw new Error(
      `pickDispatchChannel diverged from projectPreferredChannel for ${JSON.stringify(shape)}`,
    );
  }
}

// ── The regression guard: presence is not an input ──────────────────────────
// The function takes only the project. If a future edit adds a presence
// parameter back, this call stops type-checking — which is the point.
const onlyProject: (p: Parameters<typeof pickDispatchChannel>[0]) => string = pickDispatchChannel;
if (pickDispatchChannel.length !== 1) {
  throw new Error("pickDispatchChannel must take exactly the project — presence is not a tier");
}
void onlyProject;

console.log("✓ builder channel routing");
