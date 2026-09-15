// Pure tests for the reporter's half of the feedback loop — the part that lets
// the person who FILED a report follow it (src/lib/feedback/submitter.ts,
// public-status.ts).
//
// Regression pins, in the order they would hurt:
//
//  1. SHIPPED means the LIVE PRODUCT changed. A finished agent run, a merged
//     pull request and a green deploy are all still "on the way" — the same
//     honesty rule work-phase.ts enforces for the operator, now enforced on the
//     page we show a stranger. Telling a reporter their fix is live when it is
//     not is the worst thing this feature can do.
//  2. A FAILED or STUCK attempt never reads as progress. It is an open report,
//     because that is the only true and actionable thing to say.
//  3. No operator vocabulary crosses the wall: no "dispatched", no run
//     diagnostic, no pull request.
//  4. "What was done" is gated to shipped rows and stripped of links, because
//     the agent wrote it about somebody else's private repository.
//  5. An identity is never GUESSED. A name in the contact box is not an email,
//     and attributing it to an account would file one person's report under
//     another person's name.
import assert from "node:assert/strict";
import {
  isTrackTokenShape,
  mintTrackToken,
  normalizeSubmitterEmail,
  trackPath,
  trackUrl,
} from "../../src/lib/feedback/submitter";
import {
  PUBLIC_FEEDBACK_LADDER,
  PUBLIC_FEEDBACK_STEP,
  publicDidLine,
  publicFeedbackStatus,
} from "../../src/lib/feedback/public-status";
import { deriveFeedbackWork, type FeedbackRunSnapshot } from "../../src/lib/feedback/work-phase";
import { FEEDBACK_STATUS } from "../../src/lib/constants/statuses";
import { FIX_SHIP_STATE } from "../../src/lib/feedback/fix-shipping";
import { ORCH_STATE, ORCHESTRATION_OUTCOME } from "../../src/lib/orchestration/contract";

function snap(over: Partial<FeedbackRunSnapshot>): FeedbackRunSnapshot {
  return {
    id: "run-1",
    state: ORCH_STATE.WAITING,
    outcome: null,
    startedAt: new Date(),
    finishedAt: null,
    deliveredAt: null,
    lastProgressAt: null,
    error: null,
    ...over,
  };
}

/** What the reporter is told, for a DB status + optional run. */
function seen(status: Parameters<typeof publicFeedbackStatus>[0], run: FeedbackRunSnapshot | null) {
  return publicFeedbackStatus(status, deriveFeedbackWork(status, run));
}

// ── Who filed it: never guessed ─────────────────────────────────────────────
{
  assert.equal(normalizeSubmitterEmail("anushka@example.com"), "anushka@example.com");
  assert.equal(normalizeSubmitterEmail("  Anushka@Example.COM  "), "anushka@example.com");
  // The form mail clients paste.
  assert.equal(normalizeSubmitterEmail("Anushka <anushka@example.com>"), "anushka@example.com");

  // Not addresses — these stay unattributed rather than becoming somebody.
  for (const notAnEmail of ["Anushka", "", "   ", "@example.com", "anushka@", "a b@c.com", null]) {
    assert.equal(
      normalizeSubmitterEmail(notAnEmail),
      null,
      `must not treat ${JSON.stringify(notAnEmail)} as an address`,
    );
  }
  // Over the column's sane bound.
  assert.equal(normalizeSubmitterEmail(`${"a".repeat(250)}@example.com`), null);

  // Only the LAST angle group counts, so a display name cannot smuggle in a
  // different address than the one that will actually be written down.
  assert.equal(
    normalizeSubmitterEmail("<victim@example.com> Real <attacker@example.com>"),
    "attacker@example.com",
  );
}

// ── The track token is a capability, not an id ──────────────────────────────
{
  const a = mintTrackToken();
  const b = mintTrackToken();
  assert.notEqual(a, b, "tokens must not repeat");
  // 24 random bytes base64url — 192 bits, the same order as a reset link.
  assert.ok(a.length >= 32, `token too short to be unguessable: ${a.length}`);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(a), "must be URL-safe without escaping");
  assert.ok(isTrackTokenShape(a));

  // Shape guard keeps junk off the query.
  for (const junk of ["", "../../etc/passwd", "short", "a".repeat(200), "tok en", "a/b"]) {
    assert.equal(isTrackTokenShape(junk), false, `must reject ${JSON.stringify(junk)}`);
  }

  assert.equal(trackPath("abc"), "/f/abc");
  assert.equal(trackUrl("https://loki.example.com", "abc"), "https://loki.example.com/f/abc");
  // A trailing slash on the origin must not produce a double slash — that URL
  // is pasted into emails and rendered inside other people's pages.
  assert.equal(trackUrl("https://loki.example.com/", "abc"), "https://loki.example.com/f/abc");
}

// ── Shipped means LIVE. Nothing short of it says so. ────────────────────────
{
  const finishedWell = snap({
    state: ORCH_STATE.DONE,
    outcome: ORCHESTRATION_OUTCOME.SUCCESS,
    finishedAt: new Date(),
  });

  // The agent finished. The operator has not resolved. Not shipped.
  const afterRun = seen(FEEDBACK_STATUS.DISPATCHED, finishedWell);
  assert.equal(afterRun.step, PUBLIC_FEEDBACK_STEP.ON_THE_WAY);
  assert.equal(afterRun.settled, false, "a finished run does not settle a report");

  // Even with a fix that merged AND deployed: still not the operator's Resolve.
  const deployed = seen(
    FEEDBACK_STATUS.DISPATCHED,
    snap({ ...finishedWell, fix: { state: FIX_SHIP_STATE.DEPLOYED } }),
  );
  assert.notEqual(
    deployed.step,
    PUBLIC_FEEDBACK_STEP.SHIPPED,
    "a green deploy is still not the claim that the reporter's problem is fixed",
  );

  // RESOLVED is the one road in — and it wins even with no run at all.
  const resolved = seen(FEEDBACK_STATUS.RESOLVED, null);
  assert.equal(resolved.step, PUBLIC_FEEDBACK_STEP.SHIPPED);
  assert.equal(resolved.settled, true);
}

// ── A failed attempt is an open report, not progress ────────────────────────
{
  // Dispatched with no run record at all derives STUCK for the operator.
  const stuck = seen(FEEDBACK_STATUS.DISPATCHED, null);
  assert.equal(stuck.step, PUBLIC_FEEDBACK_STEP.RECEIVED);
  assert.equal(stuck.rung, 0, "a stall must not leave the reporter on a later rung");
  assert.match(stuck.detail, /still open/i);

  const failed = seen(
    FEEDBACK_STATUS.DISPATCHED,
    snap({
      state: ORCH_STATE.DONE,
      outcome: ORCHESTRATION_OUTCOME.FAILURE,
      finishedAt: new Date(),
      error: "fatal: could not read Username for 'https://github.com': No such device",
    }),
  );
  assert.equal(failed.step, PUBLIC_FEEDBACK_STEP.RECEIVED);
  assert.match(failed.detail, /still open/i);
}

// ── No operator vocabulary crosses the wall ─────────────────────────────────
{
  const leaks = /dispatch|stuck|fail|verify|pull request|\bPR\b|run |agent|github|merge|deploy/i;
  const cases = [
    seen(FEEDBACK_STATUS.NEW, null),
    seen(FEEDBACK_STATUS.DISPATCHED, null),
    seen(FEEDBACK_STATUS.RESOLVED, null),
    seen(FEEDBACK_STATUS.ARCHIVED, null),
    seen(
      FEEDBACK_STATUS.DISPATCHED,
      snap({
        state: ORCH_STATE.DONE,
        outcome: ORCHESTRATION_OUTCOME.FAILURE,
        finishedAt: new Date(),
        error: "Corrected 2026-08-24: repo evidence belonged to a sibling run",
      }),
    ),
  ];
  for (const view of cases) {
    assert.doesNotMatch(view.label, leaks, `label leaks internals: "${view.label}"`);
    assert.doesNotMatch(view.detail, leaks, `detail leaks internals: "${view.detail}"`);
    // And the raw run error never appears anywhere in what we show.
    assert.doesNotMatch(view.detail, /Corrected 2026/);
  }
}

// ── The ladder is coherent ──────────────────────────────────────────────────
{
  // Every non-closed step sits ON the ladder; closed is deliberately off it.
  for (const status of [
    FEEDBACK_STATUS.NEW,
    FEEDBACK_STATUS.DISPATCHED,
    FEEDBACK_STATUS.RESOLVED,
  ]) {
    const view = seen(status, null);
    assert.ok(
      view.rung >= 0 && view.rung < PUBLIC_FEEDBACK_LADDER.length,
      `${status} produced an off-ladder rung (${view.rung})`,
    );
  }
  const archived = seen(FEEDBACK_STATUS.ARCHIVED, null);
  assert.equal(archived.step, PUBLIC_FEEDBACK_STEP.CLOSED);
  assert.equal(archived.rung, -1, "archived left the ladder, it did not finish it");
  assert.equal(archived.settled, true);

  // Shipped is the LAST rung — the ladder must not imply something comes after.
  assert.equal(seen(FEEDBACK_STATUS.RESOLVED, null).rung, PUBLIC_FEEDBACK_LADDER.length - 1);
}

// ── "What was done" is gated, and stripped ─────────────────────────────────
{
  const line =
    "Fixed the overlapping label on the pricing table. See https://github.com/x/y/pull/9";

  // Not shipped → nothing, whatever the agent wrote.
  for (const step of [
    PUBLIC_FEEDBACK_STEP.RECEIVED,
    PUBLIC_FEEDBACK_STEP.WORKING,
    PUBLIC_FEEDBACK_STEP.ON_THE_WAY,
    PUBLIC_FEEDBACK_STEP.CLOSED,
  ]) {
    assert.equal(publicDidLine(step, line), null, `${step} must not publish the agent's handoff`);
  }

  // Shipped → published, with the internal link removed.
  const shown = publicDidLine(PUBLIC_FEEDBACK_STEP.SHIPPED, line);
  assert.ok(shown, "a shipped report should say what was done");
  assert.doesNotMatch(shown, /github\.com|https?:/, "internal links must be stripped");
  assert.match(shown, /overlapping label/);

  // Nothing to say, or nothing left once the links go, says nothing.
  assert.equal(publicDidLine(PUBLIC_FEEDBACK_STEP.SHIPPED, null), null);
  assert.equal(publicDidLine(PUBLIC_FEEDBACK_STEP.SHIPPED, ""), null);
  assert.equal(publicDidLine(PUBLIC_FEEDBACK_STEP.SHIPPED, "https://github.com/x/y/pull/9"), null);
}

console.log("feedback-reporter-loop: ok");
