// Pure tests for "ship fixes automatically" (src/lib/feedback/auto-ship.ts).
//
// This feature merges code without a person present, so every condition that
// stops it is pinned here. The ones that are NOT obvious:
//
//  * "No checks configured" is a HOLD, not a pass. dogfood-site-sep10-1201's
//    first agent PR had zero checks; treating absence-of-red as green would
//    merge on no evidence at all, which is the thing this exists to avoid.
//  * An `unverified` ledger is the agent's own claim (that is the shape the
//    org-restriction 403 produces). Never merge on a claim.
//  * A project whose last shipped fix failed to deploy stops shipping, so the
//    next fix cannot land on top of a site that is already failing to build.
import assert from "node:assert/strict";
import {
  AUTO_SHIP_HOLD,
  autoShipHoldNote,
  decideAutoShip,
  type AutoShipInput,
} from "../../src/lib/feedback/auto-ship";
import { FIX_SHIP_STATE, type FixShipping } from "../../src/lib/feedback/fix-shipping";

const openPr: FixShipping = {
  state: FIX_SHIP_STATE.PR_OPEN,
  pr: { number: 7, url: "https://github.com/bitbaum/site/pull/7", title: "Fix the hours" },
  checkedAt: new Date().toISOString(),
};

const ready: AutoShipInput = {
  autoShip: true,
  fix: openPr,
  fromOurDispatch: true,
  draft: false,
  mergeable: true,
  checkConclusions: ["success"],
  deployBroken: false,
};

const hold = (over: Partial<AutoShipInput>) => {
  const d = decideAutoShip({ ...ready, ...over });
  return d.merge ? null : d.hold;
};

// The one case that merges.
assert.deepEqual(decideAutoShip(ready), { merge: true });
assert.deepEqual(
  decideAutoShip({ ...ready, checkConclusions: ["success", "skipped", "neutral"] }),
  { merge: true },
  "skipped and neutral are not failures",
);

// Opt-in is the gate, and "never chosen" is not consent.
assert.equal(hold({ autoShip: false }), AUTO_SHIP_HOLD.NOT_ENABLED);
assert.equal(hold({ autoShip: null }), AUTO_SHIP_HOLD.NOT_ENABLED, "never chosen ≠ opted in");
assert.equal(hold({ autoShip: undefined }), AUTO_SHIP_HOLD.NOT_ENABLED);

// Evidence.
assert.equal(
  hold({ checkConclusions: [] }),
  AUTO_SHIP_HOLD.NO_CHECKS,
  "no checks is unknown, not green",
);
assert.equal(hold({ checkConclusions: ["failure"] }), AUTO_SHIP_HOLD.CHECKS_NOT_GREEN);
assert.equal(
  hold({ checkConclusions: ["success", null] }),
  AUTO_SHIP_HOLD.CHECKS_NOT_GREEN,
  "a check still running is not a pass",
);
assert.equal(hold({ checkConclusions: ["success", "cancelled"] }), AUTO_SHIP_HOLD.CHECKS_NOT_GREEN);

// Mergeability. GitHub reports `mergeable: null` while it computes — that is
// not permission.
assert.equal(hold({ draft: true }), AUTO_SHIP_HOLD.NOT_MERGEABLE);
assert.equal(hold({ mergeable: false }), AUTO_SHIP_HOLD.NOT_MERGEABLE);
assert.equal(hold({ mergeable: null }), AUTO_SHIP_HOLD.NOT_MERGEABLE, "unknown is not mergeable");

// Only our own pull request, and only one that is actually open and verified.
assert.equal(hold({ fromOurDispatch: false }), AUTO_SHIP_HOLD.NOT_OURS);
assert.equal(hold({ fix: null }), AUTO_SHIP_HOLD.NOT_OPEN);
assert.equal(hold({ fix: { ...openPr, state: FIX_SHIP_STATE.MERGED } }), AUTO_SHIP_HOLD.NOT_OPEN);
assert.equal(
  hold({ fix: { ...openPr, unverified: true } }),
  AUTO_SHIP_HOLD.NOT_OPEN,
  "never merge on the agent's claim",
);
assert.equal(
  hold({ fix: { state: FIX_SHIP_STATE.PR_OPEN, checkedAt: openPr.checkedAt } }),
  AUTO_SHIP_HOLD.NOT_OPEN,
  "no PR object, nothing to merge",
);

// A broken deploy stops the project, ahead of every other check.
assert.equal(hold({ deployBroken: true }), AUTO_SHIP_HOLD.DEPLOY_BROKEN);
assert.equal(
  hold({ deployBroken: true, checkConclusions: [] }),
  AUTO_SHIP_HOLD.DEPLOY_BROKEN,
  "the broken deploy is the thing to report, not the missing checks",
);

// Only holds a person can act on get a sentence on the row.
for (const h of [
  AUTO_SHIP_HOLD.NO_CHECKS,
  AUTO_SHIP_HOLD.CHECKS_NOT_GREEN,
  AUTO_SHIP_HOLD.NOT_MERGEABLE,
  AUTO_SHIP_HOLD.DEPLOY_BROKEN,
])
  assert.ok((autoShipHoldNote(h) ?? "").length > 20, `${h} owes the reader a sentence`);
for (const h of [AUTO_SHIP_HOLD.NOT_ENABLED, AUTO_SHIP_HOLD.NOT_OPEN, AUTO_SHIP_HOLD.NOT_OURS])
  assert.equal(autoShipHoldNote(h), null, `${h} is not news to anyone`);

console.log("feedback-auto-ship: ok");
