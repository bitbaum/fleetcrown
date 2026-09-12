// Pure tests for the run-progress contract (src/lib/run-progress.ts) — the
// heartbeat the runner sends while an agent's PTY keeps printing, and the
// freshness rule every reader applies to it.
import assert from "node:assert/strict";
import {
  isRunProgressFresh,
  RUN_BLOCKED,
  RUN_SILENCE_BEFORE_DIAGNOSIS_MS,
  shouldBeat,
  shouldDiagnoseSilence,
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

// ── Silence has two meanings ────────────────────────────────────────────────
//
// A quiet agent is either thinking (nobody's problem) or waiting for a human
// (the operator's problem, right now, and ten seconds to fix). On 2026-09-12 a
// dispatch sat silent for thirteen minutes wanting a sign-in while the row
// said only "no output", so George opened a terminal by hand to find out.
{
  const t0 = Date.UTC(2026, 8, 12, 15, 45, 0);
  const quietFor = (ms: number) => ({ bytesSinceBeat: 0, lastOutputAt: t0 - ms });

  assert.equal(shouldDiagnoseSilence(quietFor(0), t0), false, "just printed — nothing to explain");
  assert.equal(
    shouldDiagnoseSilence(quietFor(RUN_SILENCE_BEFORE_DIAGNOSIS_MS - 1), t0),
    false,
    "still plausibly thinking",
  );
  assert.equal(shouldDiagnoseSilence(quietFor(RUN_SILENCE_BEFORE_DIAGNOSIS_MS), t0), true);
  assert.equal(
    shouldDiagnoseSilence({ bytesSinceBeat: 500, lastOutputAt: t0 - 10 * 60_000 }, t0),
    false,
    "output this window means it is working, whatever the timestamp says",
  );
  // The diagnosis must land well before the row gives up on the run, or the
  // reason arrives after the reader has already been told the wrong thing.
  assert.ok(
    RUN_SILENCE_BEFORE_DIAGNOSIS_MS < RUN_PROGRESS_FRESH_MS,
    "the reason must be ready before the row has to say something",
  );

  // A blocked agent prints nothing, so the "no output, no beat" rule would
  // suppress exactly the beat that carries the reason.
  const silent = {
    bytesSinceBeat: 0,
    lastBeatAt: t0 - 5 * RUN_PROGRESS_BEAT_MS,
    startedAt: t0 - 60_000,
  };
  assert.equal(shouldBeat(silent, t0), "wait", "silence alone still says nothing");
  assert.equal(
    shouldBeat({ ...silent, blocked: RUN_BLOCKED.AUTH }, t0),
    "beat",
    "silence WITH a reason is the message",
  );
  assert.equal(
    shouldBeat({ ...silent, blocked: RUN_BLOCKED.AUTH, lastBeatAt: t0 - 1000 }, t0),
    "wait",
    "still no more than one beat per window",
  );
}

console.log("run-progress-blocked: ok");
