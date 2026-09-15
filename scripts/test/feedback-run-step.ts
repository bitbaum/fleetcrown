import assert from "node:assert/strict";
import { summarizeRunStep, furthestRunEventKind } from "../../src/lib/feedback/run-step";
import {
  deriveFeedbackWork,
  FEEDBACK_WORK_PHASE,
  WAITING_ON,
} from "../../src/lib/feedback/work-phase";
import { FEEDBACK_STATUS } from "../../src/lib/constants/statuses";
import { ORCH_STATE } from "../../src/lib/orchestration/contract";

const waiting = summarizeRunStep({
  latestKind: "dispatched",
  deliveredAt: null,
  lastProgressAt: null,
  pendingUnclaimed: true,
});
assert.equal(waiting.kind, "waiting_builder");
assert.match(waiting.summary, /cloud builder/i);

const hosted = summarizeRunStep({
  latestKind: "dispatched",
  deliveredAt: null,
  lastProgressAt: null,
  hosted: true,
  pendingUnclaimed: true,
});
assert.equal(hosted.kind, "hosted_queued");

assert.equal(furthestRunEventKind(["dispatched", "claimed", "launched"]), "launched");

const offline = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, {
  id: "r1",
  state: ORCH_STATE.WAITING,
  outcome: null,
  startedAt: new Date(),
  finishedAt: null,
  deliveredAt: null,
  lastProgressAt: null,
  error: null,
  builderOffline: true,
});
assert.equal(offline.phase, FEEDBACK_WORK_PHASE.STUCK);
assert.equal(offline.waitingOn, WAITING_ON.YOU);
assert.equal(offline.label, "Builder offline");
assert.ok(offline.diagnostic?.toLowerCase().includes("offline"));
assert.equal(offline.watchable, true);

const youngOnline = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, {
  id: "r2",
  state: ORCH_STATE.WAITING,
  outcome: null,
  startedAt: new Date(),
  finishedAt: null,
  deliveredAt: null,
  lastProgressAt: null,
  error: null,
  builderOffline: false,
  pendingUnclaimed: true,
});
assert.equal(youngOnline.phase, FEEDBACK_WORK_PHASE.QUEUED);
assert.equal(youngOnline.waitingOn, WAITING_ON.MACHINE);
assert.ok(youngOnline.stepSummary);
assert.equal(youngOnline.watchable, true);

console.log("feedback-run-step: ok");
