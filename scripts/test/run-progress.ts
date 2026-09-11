// Pure tests for the run-progress contract (src/lib/run-progress.ts) — the
// heartbeat the runner sends while an agent's PTY keeps printing, and the
// freshness rule every reader applies to it.
import assert from "node:assert/strict";
import {
  isRunProgressFresh,
  shouldBeat,
  RUN_PROGRESS_BEAT_MS,
  RUN_PROGRESS_FRESH_MS,
  RUN_PROGRESS_MAX_MS,
} from "../../src/lib/run-progress";

const now = Date.UTC(2026, 8, 11, 12, 0, 0);

// Freshness: a recent beat proves life, an old one does not, garbage never does.
assert.equal(isRunProgressFresh(null, now), false);
assert.equal(isRunProgressFresh("not a date", now), false);
assert.equal(isRunProgressFresh(new Date(now - 60_000).toISOString(), now), true);
assert.equal(
  isRunProgressFresh(new Date(now - RUN_PROGRESS_FRESH_MS + 1000).toISOString(), now),
  true,
);
assert.equal(
  isRunProgressFresh(new Date(now - RUN_PROGRESS_FRESH_MS - 1).toISOString(), now),
  false,
);

// The runner's tick: silence never beats (that is what makes silence mean
// stalled), output beats at most once per window, a runaway stops.
const base = {
  bytesSinceBeat: 0,
  lastBeatAt: now - 2 * RUN_PROGRESS_BEAT_MS,
  startedAt: now - 60_000,
};
assert.equal(shouldBeat(base, now), "wait", "no output → no beat");
assert.equal(
  shouldBeat({ ...base, bytesSinceBeat: 12 }, now),
  "beat",
  "output after the window → beat",
);
assert.equal(
  shouldBeat({ ...base, bytesSinceBeat: 12, lastBeatAt: now - RUN_PROGRESS_BEAT_MS / 2 }, now),
  "wait",
  "output inside the window → wait for the window",
);
assert.equal(
  shouldBeat({ ...base, bytesSinceBeat: 12, startedAt: now - RUN_PROGRESS_MAX_MS - 1 }, now),
  "stop",
  "past the ceiling → stop even with output",
);

console.log("run-progress: ok");
