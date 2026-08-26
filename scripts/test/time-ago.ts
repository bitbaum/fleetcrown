/**
 * The regression: a twelve-day-old agent handoff rendered on /control as
 * "Next (agent, 288h ago)". timeAgo stopped scaling at hours, so anything
 * older than a day came out as a large meaningless number on a card whose
 * whole claim is telling you how current its "Next" is.
 */
import assert from "node:assert/strict";
import { timeAgo } from "../../src/lib/dates";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const ago = (deltaMs: number) => timeAgo(Date.now() - deltaMs);

// Unchanged below a day — 14 callers depend on these and they were never broken.
assert.equal(ago(0), "just now");
assert.equal(ago(20 * 1000), "just now");
assert.equal(ago(40 * 1000), "1m ago", "minutes round, they do not floor — long-standing behaviour");
assert.equal(ago(5 * MIN), "5m ago");
assert.equal(ago(59 * MIN), "59m ago");
assert.equal(ago(2 * HOUR), "2h ago");
assert.equal(ago(23 * HOUR), "23h ago");

// THE regression: 288 hours is 12 days.
assert.equal(ago(288 * HOUR), "12d ago", "288h ago must read as the fortnight it is");
assert.equal(ago(DAY), "1d ago", "the hour->day boundary does not skip a tier");
assert.equal(ago(6 * DAY), "6d ago");

// Days run to a month before weeks take over: for a stale handoff "12d ago" is
// the useful reading, and "2w ago" throws away the precision that makes it
// actionable.
assert.equal(ago(30 * DAY), "30d ago");
assert.equal(ago(35 * DAY), "5w ago");

// No tier may ever render the raw hour count again, at any age.
for (const days of [1, 2, 7, 12, 29, 30, 45, 200, 900]) {
  const out = ago(days * DAY);
  assert.ok(!/^\d+h ago$/.test(out), `${days}d must not render as hours, got "${out}"`);
  assert.ok(/^\d+[dw] ago$/.test(out), `${days}d rendered unexpectedly as "${out}"`);
}

console.log("✓ time-ago tests passed");
