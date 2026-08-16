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
 * The routing rule itself is three-tiered, and the order is the whole design:
 *
 *   1. lock     — physics. Only one builder can materialize this project.
 *   2. presence — policy. Is the operator at their machine, or away?
 *   3. floor    — nobody is online; still name a target and queue for it.
 *
 * Tier 1 must never lose to tier 2: routing a laptop-only project to the cloud
 * because the laptop is asleep hands the agent an empty directory. Both of
 * those orderings are negative-tested — removing either rule from
 * pickDispatchChannel makes a case below fail.
 */
import { projectPreferredChannel, projectChannelLock, pickDispatchChannel } from "@/lib/execution-access";
import { BUILDER_CHANNELS, DEFAULT_BUILDER_CHANNEL } from "@/lib/constants/statuses";
import { channelDurability } from "@/lib/builder-presence";

const CLONEABLE = "https://github.com/maonakamoto/fleetcrown.git";

const BOTH = { local: true, cloud: true, any: true };
const ONLY_LOCAL = { local: true, cloud: false, any: true };
const ONLY_CLOUD = { local: false, cloud: true, any: true };
const NEITHER = { local: false, cloud: false, any: false };

const LOCKED = { dirPath: "/home/g/dev/scratch", gitUrl: null };
const PORTABLE = { dirPath: "/home/g/dev/fleetcrown", gitUrl: CLONEABLE };

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

// ── Routing policy: where the dispatch actually goes ────────────────────────
//
// Local and cloud are not two servers, they are two products. Local runs in the
// operator's own checkout — visible in the editor they already have open, with
// their env and logins. Cloud runs in a fresh clone on the box and returns work
// only through git. So presence is the proxy for "is the operator here?".

// Operator at the machine → their tree. Even with the box also online: the box
// winning here is exactly the bug that made a closed lid destroy work.
if (pickDispatchChannel(PORTABLE, BOTH) !== "local") {
  throw new Error("with both online, the operator's own machine wins");
}
if (pickDispatchChannel(PORTABLE, ONLY_LOCAL) !== "local") {
  throw new Error("local-only presence must route local");
}

// Operator away (asleep, lid shut, phone) → the always-on box, so the work
// happens instead of waiting for a laptop that may not open until tomorrow.
if (pickDispatchChannel(PORTABLE, ONLY_CLOUD) !== "cloud") {
  throw new Error("cloud-only presence must route cloud");
}

// Nobody home: still name a target (never leave it contested) and queue.
if (pickDispatchChannel(PORTABLE, NEITHER) !== DEFAULT_BUILDER_CHANNEL) {
  throw new Error("no presence must fall back to the floor, not to null");
}

// Physics outranks policy. A dirPath-only project must NEVER be routed to the
// cloud just because the laptop is asleep — the cloud builder would clone-fail
// and hand the agent an empty directory (the 2026-07-14 misroute). It waits.
if (pickDispatchChannel(LOCKED, ONLY_CLOUD) !== "local") {
  throw new Error("locked project must not follow presence to the cloud");
}
if (pickDispatchChannel(LOCKED, NEITHER) !== "local") {
  throw new Error("locked project stays local with nothing online");
}
if (pickDispatchChannel(LOCKED, BOTH) !== "local") {
  throw new Error("locked project stays local even when both are online");
}

// The lock predicate itself: null means "either builder can obtain this", which
// is a real answer, not an absent one — pickDispatchChannel resolves it.
if (projectChannelLock(LOCKED) !== "local") throw new Error("lock: dirPath-only is local");
if (projectChannelLock(PORTABLE) !== null) throw new Error("lock: cloneable is unlocked");
if (projectChannelLock(null) !== null) throw new Error("lock: absent project is unlocked");

// Same never-unrouted guarantee, now across the presence matrix.
for (const presence of [BOTH, ONLY_LOCAL, ONLY_CLOUD, NEITHER]) {
  for (const shape of SHAPES) {
    const channel = pickDispatchChannel(shape, presence);
    if (!channel || !(BUILDER_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`unrouted: ${JSON.stringify(shape)} @ ${JSON.stringify(presence)} → ${JSON.stringify(channel)}`);
    }
  }
}

// ── Durability: "connected" is not "dependable" ─────────────────────────────
//
// Presence alone read as "the operator is at the laptop". A dispatch sent from
// a phone while the laptop merely happens to be awake landed on a machine
// nobody was watching, which sleeps the instant the lid shuts. Battery is the
// honest proxy for "not a dependable host".

// The case this exists for: laptop awake but on battery, box available → box.
if (pickDispatchChannel(PORTABLE, BOTH, "ephemeral") !== "cloud") {
  throw new Error("a battery-powered laptop must not win over the always-on box");
}

// Plugged in: it IS dependable, and it is where the operator can watch it.
if (pickDispatchChannel(PORTABLE, BOTH, "durable") !== "local") {
  throw new Error("a laptop on wall power stays the preferred host");
}

// THE REGRESSION GUARD. A runner that predates powerSource reports nothing.
// Treating that silence as "battery" would stop every un-upgraded desktop from
// receiving work — fatal for an account with no cloud builder to fall back to.
// Unknown must behave exactly as before durability existed.
for (const presence of [BOTH, ONLY_LOCAL]) {
  if (pickDispatchChannel(PORTABLE, presence, "unknown") !== "local") {
    throw new Error("unknown power must never demote a connected local builder");
  }
}
if (pickDispatchChannel(PORTABLE, BOTH) !== "local") {
  throw new Error("omitting durability entirely must behave as unknown");
}

// A battery laptop still beats nothing: demotion is only ever a redirect to a
// better host, never a refusal to run.
if (pickDispatchChannel(PORTABLE, ONLY_LOCAL, "ephemeral") !== "local") {
  throw new Error("with no box available, the battery laptop is still the answer");
}

// Physics outranks durability too: a laptop-only project on battery still has
// nowhere else to go, and the cloud would clone-fail into an empty directory.
if (pickDispatchChannel(LOCKED, BOTH, "ephemeral") !== "local") {
  throw new Error("a locked project must not be demoted to a builder that cannot materialize it");
}

// Never unrouted, now across presence × durability.
for (const presence of [BOTH, ONLY_LOCAL, ONLY_CLOUD, NEITHER]) {
  for (const durability of ["durable", "ephemeral", "unknown"] as const) {
    for (const shape of SHAPES) {
      const channel = pickDispatchChannel(shape, presence, durability);
      if (!channel || !(BUILDER_CHANNELS as readonly string[]).includes(channel)) {
        throw new Error(`unrouted: ${JSON.stringify(shape)} @ ${JSON.stringify(presence)}/${durability}`);
      }
    }
  }
}

// ── Durability derivation: a stale "ac" must not vouch for a sleeping laptop ─
const FRESH = new Date();
const STALE = new Date(Date.now() - 60 * 60 * 1000);

if (channelDurability("local", [{ channel: "local", observedAt: FRESH, powerSource: "ac" }]) !== "durable") {
  throw new Error("fresh ac heartbeat is durable");
}
if (channelDurability("local", [{ channel: "local", observedAt: FRESH, powerSource: "battery" }]) !== "ephemeral") {
  throw new Error("fresh battery heartbeat is ephemeral");
}
// The dangerous one: the laptop said "ac" an hour ago and has since slept.
if (channelDurability("local", [{ channel: "local", observedAt: STALE, powerSource: "ac" }]) !== "unknown") {
  throw new Error("a stale ac reading must expire to unknown, not keep vouching");
}
if (channelDurability("local", [{ channel: "local", observedAt: FRESH }]) !== "unknown") {
  throw new Error("a heartbeat with no power field is unknown, not battery");
}
if (channelDurability("local", [{ channel: "local", observedAt: FRESH, powerSource: null }]) !== "unknown") {
  throw new Error("an explicit null power field is unknown, not battery");
}
if (channelDurability("local", []) !== "unknown") {
  throw new Error("no heartbeat at all is unknown");
}
// Channels must not read each other's power state.
if (channelDurability("local", [{ channel: "cloud", observedAt: FRESH, powerSource: "ac" }]) !== "unknown") {
  throw new Error("durability must be per-channel");
}

console.log("✓ builder channel routing");
