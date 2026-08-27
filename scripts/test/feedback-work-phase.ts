// Pure tests for the feedback work-phase honesty layer. The one regression
// this file exists to pin: a DISPATCHED row with NO run record is STUCK
// (retryable, poll stops), never a perpetual QUEUED — the run row is created
// before the status flips, so "no record" always means failed-create or
// pruned, and QUEUED-forever had no exit (endless 8s polls, no Retry button,
// and the dispatch route's duplicate-guard treating it as un-retryable).
import assert from "node:assert/strict";
import {
  deriveFeedbackWork,
  FEEDBACK_WORK_PHASE,
  type FeedbackRunSnapshot,
} from "../../src/lib/feedback/work-phase";
import { FEEDBACK_STATUS } from "../../src/lib/constants/statuses";
import { ORCH_STATE, ORCHESTRATION_OUTCOME } from "../../src/lib/orchestration/contract";

function snap(over: Partial<FeedbackRunSnapshot>): FeedbackRunSnapshot {
  return {
    id: "run-1",
    state: ORCH_STATE.WAITING,
    outcome: null,
    startedAt: new Date(),
    finishedAt: null,
    deliveredAt: null,
    error: null,
    ...over,
  };
}

// Terminal statuses ignore the run entirely.
assert.equal(deriveFeedbackWork(FEEDBACK_STATUS.ARCHIVED, null).phase, FEEDBACK_WORK_PHASE.ARCHIVED);
assert.equal(deriveFeedbackWork(FEEDBACK_STATUS.RESOLVED, null).phase, FEEDBACK_WORK_PHASE.DONE);
assert.equal(deriveFeedbackWork(FEEDBACK_STATUS.NEW, null).phase, FEEDBACK_WORK_PHASE.NOT_STARTED);

// THE regression pin: dispatched + no run record = STUCK, not queued.
const runless = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, null);
assert.equal(runless.phase, FEEDBACK_WORK_PHASE.STUCK, "run-less dispatched row must be STUCK (retryable)");

// Live states.
assert.equal(
  deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, snap({ state: ORCH_STATE.RUNNING })).phase,
  FEEDBACK_WORK_PHASE.WORKING,
);
assert.equal(
  deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, snap({ startedAt: new Date(Date.now() - 10_000) })).phase,
  FEEDBACK_WORK_PHASE.QUEUED,
  "young undelivered run is queued",
);
assert.equal(
  deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, snap({ startedAt: new Date(Date.now() - 5 * 60_000) })).phase,
  FEEDBACK_WORK_PHASE.STUCK,
  "undelivered past the starting window is stuck",
);
assert.equal(
  deriveFeedbackWork(
    FEEDBACK_STATUS.DISPATCHED,
    snap({ startedAt: new Date(Date.now() - 5 * 60_000), deliveredAt: new Date().toISOString() }),
  ).phase,
  FEEDBACK_WORK_PHASE.WORKING,
  "delivered within the thinking window is working",
);
assert.equal(
  deriveFeedbackWork(
    FEEDBACK_STATUS.DISPATCHED,
    snap({ startedAt: new Date(Date.now() - 20 * 60_000), deliveredAt: new Date().toISOString() }),
  ).phase,
  FEEDBACK_WORK_PHASE.STUCK,
  "delivered but silent past the thinking window is stuck",
);

// Closed states.
assert.equal(
  deriveFeedbackWork(
    FEEDBACK_STATUS.DISPATCHED,
    snap({ state: ORCH_STATE.CLOSED, outcome: ORCHESTRATION_OUTCOME.SUCCESS, finishedAt: new Date() }),
  ).phase,
  FEEDBACK_WORK_PHASE.DONE,
);
assert.equal(
  deriveFeedbackWork(
    FEEDBACK_STATUS.DISPATCHED,
    snap({ state: ORCH_STATE.CLOSED, outcome: ORCHESTRATION_OUTCOME.ERROR, finishedAt: new Date() }),
  ).phase,
  FEEDBACK_WORK_PHASE.FAILED,
);
assert.equal(
  deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, snap({ outcome: ORCHESTRATION_OUTCOME.HANG })).phase,
  FEEDBACK_WORK_PHASE.FAILED,
);

// Never the word the layer exists to kill.
for (const status of [FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.DISPATCHED, FEEDBACK_STATUS.RESOLVED] as const) {
  assert.ok(
    !deriveFeedbackWork(status, null).label.toLowerCase().includes("dispatched"),
    "labels never say 'dispatched'",
  );
}

// A detail line must EARN its row: it exists only to say what the badge cannot.
// "No agent has been asked to fix this yet." said nothing the "Not started"
// badge and the "Implement" button had not already said, and the fleet strip
// printed it once per row — five identical sentences on five new items.
assert.equal(
  deriveFeedbackWork(FEEDBACK_STATUS.NEW, null).detail,
  null,
  "Not started carries no detail — the badge and the Implement button already say it",
);

// Not generalised on purpose. "Adds information" is a judgement about meaning,
// and every mechanical proxy tried here (must contain an imperative; must not
// prefix-match the label) either missed the sentence above or failed honest
// copy like "Starting — waiting for the agent to pick it up." So this stays a
// single pin plus a reviewer's eye, rather than a green check that proves
// nothing.

// A raw run error is a diagnostic, not advice. /control printed one verbatim,
// twice: "Corrected 2026-08-24: repo evidence in the run window belonged to a
// sibling run; this run was acked verified:false and never started." The
// detail line is written for a human; the executor's text goes behind a
// disclosure the reader opens on purpose.
{
  const note = "Corrected 2026-08-24: repo evidence in the run window belonged to a sibling run";
  const failed = deriveFeedbackWork(
    FEEDBACK_STATUS.DISPATCHED,
    snap({ state: ORCH_STATE.ERROR, error: note }),
  );
  assert.equal(failed.phase, FEEDBACK_WORK_PHASE.FAILED);
  assert.equal(failed.diagnostic, note, "the error is kept — it is the most useful text when a run really did fail");
  assert.ok(
    failed.detail && !failed.detail.includes("Corrected"),
    "...but the line addressed to the reader is written for the reader",
  );
  assert.ok(failed.detail!.includes("Retry"), "and it still says what to do next");
}

console.log("✓ feedback work-phase tests passed");
