/**
 * A run whose prompt never reached an agent must never be closed from a
 * session handoff — least of all as `success`.
 *
 * Regression: 2026-08-24. Five feedback fixes were dispatched at once; FIFO
 * serialized them, so one was delivered and four sat queued. At the 60-minute
 * mark purgeStalePendingCommands deleted the queued commands (their gate-hold
 * grace had expired) and the close sweep ran in the same tick. With the
 * pending_commands row gone, the "is it still queued?" guard read absent as
 * delivered, and `runEffectiveStartMs` fell back to startedAt — so the ONE
 * delivered run's ready handoff post-dated all four and closed them. Three
 * were stamped success; two visitor reports were auto-resolved as shipped
 * having never been touched.
 *
 * The invariant: absence of `deliveredAt` is positive evidence of
 * non-delivery, not missing information. Undelivered runs belong to the
 * reaper, which stamps the honest `timeout`.
 *
 * Run: npx tsx scripts/test/undelivered-run-close.ts
 */
import { closeRunFromSession, runWasDelivered, type OpenRun } from "@/lib/orchestration/close-from-session";
import type { SessionState } from "@/lib/control-types";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const DISPATCHED_MS = 1_000;
// The sibling's handoff: genuinely ready, and later than every run's dispatch.
const READY: SessionState = {
  status: "ready",
  mtime: 5_000,
  summary: "shipped the fix",
} as unknown as SessionState;

const undelivered: OpenRun = {
  startedAt: new Date(DISPATCHED_MS),
  finishedAt: null,
  payload: { projectKey: "orangecat" } as OpenRun["payload"],
};
const delivered: OpenRun = {
  startedAt: new Date(DISPATCHED_MS),
  finishedAt: null,
  payload: { deliveredAt: new Date(2_000).toISOString() } as OpenRun["payload"],
};

console.log("undelivered runs cannot be closed from a handoff");
ok("no deliveredAt → runWasDelivered false", !runWasDelivered(undelivered));
ok("deliveredAt → runWasDelivered true", runWasDelivered(delivered));

// The core regression: the handoff post-dates startedAt, so ONLY the delivery
// check can reject it. If this returns a patch, feedback gets auto-resolved.
const undeliveredPatch = closeRunFromSession(undelivered, READY);
ok("a ready handoff does NOT close an undelivered run", undeliveredPatch === null);
ok(
  "…and so cannot stamp it success",
  undeliveredPatch === null || undeliveredPatch.outcome !== "success",
);

// The delivered sibling must still close — the guard has to reject the
// undelivered case WITHOUT breaking the path that legitimately works.
ok("a ready handoff still closes the delivered run", closeRunFromSession(delivered, READY) !== null);

// A handoff written before delivery is somebody else's work even when the run
// WAS eventually delivered.
const lateDelivery: OpenRun = {
  startedAt: new Date(DISPATCHED_MS),
  finishedAt: null,
  payload: { deliveredAt: new Date(9_000).toISOString() } as OpenRun["payload"],
};
ok("a handoff predating delivery does not close the run", closeRunFromSession(lateDelivery, READY) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
