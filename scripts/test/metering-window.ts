/**
 * One directory, one metered run.
 *
 * Guards the 2026-08-14 / 08-24 prod defect: two runs metering the same
 * directory with overlapping [deliveredAt, now] windows replay the SAME
 * transcript and report the same tokens twice. Verified against prod — runs
 * 844608d3 and 9a560f3f (orangecat) carried byte-identical totals, identical
 * sessionIds and $1.7605 each.
 *
 * Pure unit test: no DB, no server, no runner. Auto-discovered by
 * scripts/test-unit.ts.
 */
import assert from "node:assert";
import {
  closeWindowsForDirectory,
  meteringWindowEnd,
  type MeteredEntry,
} from "../../src/lib/usage/metering-window";

const T0 = Date.parse("2026-08-14T00:20:00Z");
const MIN = 60_000;

const entry = (runId: string, dir: string, atMs: number): MeteredEntry => ({
  runId,
  dir,
  deliveredAtMs: atMs,
});

// ── the defect itself ──────────────────────────────────────────────────────
{
  const a = entry("a", "/dev/orangecat", T0);
  const b = entry("b", "/dev/orangecat", T0 + MIN);
  const closed = closeWindowsForDirectory([a, b], b);

  assert.deepEqual(closed, ["a"], "the superseded run's window was not closed");
  assert.equal(a.windowEndMs, T0 + MIN, "run A's window must end where B was delivered");
  assert.equal(b.windowEndMs, undefined, "the new owner's window must stay open");

  // The observable consequence: A and B no longer share a single instant of
  // transcript. Without the clamp both ended at `now` and summed the same
  // assistant messages.
  const now = T0 + 10 * MIN;
  assert.equal(meteringWindowEnd(a, now), T0 + MIN, "A still runs to now");
  assert.equal(meteringWindowEnd(b, now), now, "B should run to now");
  assert.ok(
    meteringWindowEnd(a, now) <= b.deliveredAtMs,
    "windows still overlap — the same tokens would be billed twice",
  );
}

// ── a third run closes the second too (the 08-24 109-minute case) ──────────
{
  const a = entry("a", "/dev/orangecat", T0);
  const b = entry("b", "/dev/orangecat", T0 + MIN);
  const c = entry("c", "/dev/orangecat", T0 + 2 * MIN);
  closeWindowsForDirectory([a, b, c], b);
  closeWindowsForDirectory([a, b, c], c);

  assert.equal(a.windowEndMs, T0 + MIN, "A must keep its EARLIER bound, not widen to C");
  assert.equal(b.windowEndMs, T0 + 2 * MIN, "B must end where C was delivered");
  assert.equal(c.windowEndMs, undefined, "C is the current owner");
}

// ── a different directory is a different transcript — leave it alone ───────
{
  const other = entry("other", "/dev/printcraft", T0);
  const mine = entry("mine", "/dev/orangecat", T0 + MIN);
  const closed = closeWindowsForDirectory([other, mine], mine);
  assert.deepEqual(closed, [], "closed a window in an unrelated directory");
  assert.equal(other.windowEndMs, undefined, "an unrelated run lost its live window");
}

// ── narrowing only: never widen a window back over someone else's tokens ───
{
  const a = entry("a", "/dev/orangecat", T0);
  a.windowEndMs = T0 + MIN;
  closeWindowsForDirectory([a], entry("late", "/dev/orangecat", T0 + 5 * MIN));
  assert.equal(a.windowEndMs, T0 + MIN, "an already-closed window was widened");
}

// ── out-of-order delivery must not hand a newer run's tokens to an older one ─
{
  const newer = entry("newer", "/dev/orangecat", T0 + 5 * MIN);
  const closed = closeWindowsForDirectory([newer], entry("older", "/dev/orangecat", T0));
  assert.deepEqual(closed, [], "closed a run delivered AFTER the claimant");
  assert.equal(newer.windowEndMs, undefined, "the newer owner's window was closed");
}

// ── re-tracking the same run (poller retry) is a no-op ─────────────────────
{
  const a = entry("a", "/dev/orangecat", T0);
  closeWindowsForDirectory([a], a);
  assert.equal(a.windowEndMs, undefined, "a run closed its own window");
}

// ── a superseded-before-generating run reports an honest 0, never a negative ─
{
  const a = entry("a", "/dev/orangecat", T0);
  closeWindowsForDirectory([a], entry("b", "/dev/orangecat", T0 - MIN));
  // b predates a, so a is untouched and still runs to now.
  assert.equal(meteringWindowEnd(a, T0 - 10 * MIN) >= a.deliveredAtMs, true,
    "window end fell below its own start — collectClaudeUsage would scan an inverted range");
}

console.log("✓ metering-window: one directory, one metered run");
