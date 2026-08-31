/**
 * "Builder online" is a LIVENESS claim, and every liveness claim needs an
 * expiry — the rule the whole /control truth pass turned on.
 *
 * `runner_presence` is connection bookkeeping written by the bridge on SSE
 * connect/disconnect. It has no expiry of its own: `markDisconnect` is
 * fire-and-forget, so a disconnect lost to a DB blip — or a half-open socket
 * the bridge never sees close — pins `connected = true` until the bridge
 * process restarts. Tabs, versions and runtime observations all expire
 * (RUNNER_OFFLINE_THRESHOLD_MS); presence did not, so the hero could claim
 * "this computer online" for a laptop that had been shut for days.
 *
 * Demanding a heartbeat is safe because the runner pushes a snapshot every
 * RUNNER_HEARTBEAT_MS whether or not anything changed, plus once immediately
 * at launch — silence past the threshold means stopped, not quiet.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyHeartbeatExpiry, isHeartbeatFresh } from "../../src/lib/builder-presence";
import { RUNNER_HEARTBEAT_MS, RUNNER_OFFLINE_THRESHOLD_MS } from "../../src/lib/constants/runner";

const root = join(__dirname, "..", "..");
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const NOW = 1_800_000_000_000; // fixed clock — these tests must not depend on wall time
const ago = (ms: number) => new Date(NOW - ms);
const BOTH = { cloud: true, local: true, any: true };
const fresh = (channel: string) => ({ channel, observedAt: ago(60_000) });
const stale = (channel: string) => ({
  channel,
  observedAt: ago(RUNNER_OFFLINE_THRESHOLD_MS + 60_000),
});

check("a connected channel with a fresh heartbeat is online", () => {
  const r = applyHeartbeatExpiry(BOTH, [fresh("cloud"), fresh("local")], NOW);
  assert(r.cloud && r.local && r.any, `expected both channels online, got ${JSON.stringify(r)}`);
});

check("a connected channel whose heartbeat went stale is OFFLINE", () => {
  // The bug: connection flags said online forever. This is the assertion that
  // fails if presence ever goes back to trusting connect/disconnect alone.
  const r = applyHeartbeatExpiry(BOTH, [fresh("cloud"), stale("local")], NOW);
  assert(!r.local, "a laptop that stopped heartbeating must not still read online");
  assert(r.cloud, "the cloud channel's own heartbeat is unaffected by the laptop's");
  assert(r.any, "any must stay true while one channel is genuinely live");
});

check("a connected channel that never pushed a heartbeat is OFFLINE", () => {
  const r = applyHeartbeatExpiry(BOTH, [], NOW);
  assert(!r.cloud && !r.local && !r.any, `no heartbeat = no claim, got ${JSON.stringify(r)}`);
});

check("a heartbeat alone does not make a disconnected builder online", () => {
  // AND, not OR: a runner posting snapshots while its SSE channel is down
  // cannot receive dispatches, so it is not an executor.
  const r = applyHeartbeatExpiry(
    { cloud: false, local: false, any: false },
    [fresh("cloud"), fresh("local")],
    NOW,
  );
  assert(!r.any, "presence must require BOTH the connection and the heartbeat");
});

check("`any` is exactly the OR of the surviving channels", () => {
  const only = applyHeartbeatExpiry(BOTH, [stale("cloud"), fresh("local")], NOW);
  assert(only.any === (only.cloud || only.local), "any must not drift from the channel flags");
  assert(!only.cloud && only.local, `expected local-only, got ${JSON.stringify(only)}`);
});

check("expiry uses the shared runner threshold, not a private literal", () => {
  // One tick inside the threshold is alive; one tick past it is not. Pins the
  // boundary to lib/constants/runner so raising the heartbeat cadence
  // auto-scales this too (the 90s-vs-5min drift that caused UI flicker).
  assert(
    isHeartbeatFresh(ago(RUNNER_OFFLINE_THRESHOLD_MS - 1_000), NOW),
    "just inside the threshold must be fresh",
  );
  assert(
    !isHeartbeatFresh(ago(RUNNER_OFFLINE_THRESHOLD_MS + 1_000), NOW),
    "just past the threshold must be stale",
  );
  assert(!isHeartbeatFresh(null, NOW), "a missing observation is not fresh");
  assert(
    RUNNER_OFFLINE_THRESHOLD_MS > RUNNER_HEARTBEAT_MS,
    "the offline threshold must exceed one heartbeat interval or healthy runners flicker offline",
  );
});

check("getBuilderPresence routes connection flags through the expiry", () => {
  // Structural, not behavioural: importing the query module needs a DATABASE_URL
  // and this suite must run without one. Guards against a future refactor
  // returning the raw connect/disconnect flags again.
  const src = readFileSync(join(root, "src/db/queries/runner-presence.ts"), "utf8");
  const start = src.indexOf("export async function getBuilderPresence");
  assert(start !== -1, "getBuilderPresence not found in src/db/queries/runner-presence.ts");
  // Its own body only — the private readConnectionFlags helper below it
  // legitimately returns the raw flags; that is what this function expires.
  const nextFn = src.indexOf("\nasync function ", start);
  const body = src.slice(start, nextFn === -1 ? undefined : nextFn);
  assert(
    body.includes("applyHeartbeatExpiry("),
    "getBuilderPresence must expire connection presence against the heartbeat",
  );
  assert(
    !/return\s+inferBuilderChannelPresence\(/.test(body),
    "getBuilderPresence must not return unexpired connection flags directly",
  );
});

check("presence heartbeats are read at request time, never from the slow cache", () => {
  // The other direction of the same lie, found on prod: /api/control's SlowCache
  // has a 20s TTL but SERVES STALE while refreshing in the background, so the
  // first request after an idle spell gets a cache built minutes ago. Handing
  // those timestamps to the expiry aged a live runner past the threshold and
  // reported a heartbeating builder as offline. An age is only meaningful
  // against the clock it is compared to — read the timestamp now, or not at all.
  const route = readFileSync(join(root, "src/app/api/control/route.ts"), "utf8");
  assert(
    !/channelHeartbeats/.test(route),
    "/api/control must not carry heartbeat timestamps through its slow cache",
  );
  assert(
    /getBuilderPresence\(userId, runnerVersion\)/.test(route),
    "/api/control must call getBuilderPresence without pre-loaded heartbeats",
  );
  const q = readFileSync(join(root, "src/db/queries/runner-presence.ts"), "utf8");
  const sig = q.slice(q.indexOf("export async function getBuilderPresence"));
  assert(
    !/heartbeats\??:/.test(sig.slice(0, sig.indexOf("{"))),
    "getBuilderPresence must not accept caller-supplied heartbeats — they may be arbitrarily old",
  );
});

console.log(`\n${passed}/${passed} passed`);
