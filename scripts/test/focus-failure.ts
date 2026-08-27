/**
 * Pins the rule that a Retry button must be able to succeed. /control showed
 * "focus_tab -> orangecat failed: tab not found: orangecat" with a Retry beside
 * it for 47 minutes; every click re-issued the same command at the same absent
 * target.
 */
import assert from "node:assert/strict";
import {
  FAILURE_REMEDY,
  FOCUS_FAILURE_PHRASE,
  remedyForFailure,
} from "../../src/lib/terminals/focus-failure";

// The exact messages buildFocusError composes, built from the same constants
// it interpolates — so a reworded message that no longer contains its phrase
// fails here rather than silently rendering the wrong button.
const noTerminal = `Cannot inject into "orangecat": ${FOCUS_FAILURE_PHRASE.NO_TERMINAL}. Start zellij (or Fleet Runner, which manages it for you) and retry.`;
const noTarget = `Cannot inject into "orangecat": ${FOCUS_FAILURE_PHRASE.NO_SUCH_TARGET}, and no running agent with a working directory inside that project. Open the project or start an agent in it. Currently open — main: Tab #9.`;
const timedOut = `Cannot inject into "orangecat": found in session "main" but ${FOCUS_FAILURE_PHRASE.FOCUS_TIMED_OUT} 1s. Reattach (zellij attach main) or restart the session, then retry.`;

assert.equal(remedyForFailure(noTerminal), FAILURE_REMEDY.START_TERMINAL);
assert.equal(
  remedyForFailure(noTarget),
  FAILURE_REMEDY.START_SESSION,
  "THE regression: nothing to aim at means start a session, not retry the miss",
);
assert.equal(
  remedyForFailure(timedOut),
  FAILURE_REMEDY.RETRY,
  "a tab that WAS found and merely lost a focus race is genuinely retryable",
);

// Unrecognised failures stay retryable on purpose. Being wrong this way costs
// one wasted click; being wrong the other way strands work with no way forward.
assert.equal(remedyForFailure("ECONNRESET"), FAILURE_REMEDY.RETRY);
assert.equal(remedyForFailure(""), FAILURE_REMEDY.RETRY);
assert.equal(remedyForFailure(null), FAILURE_REMEDY.RETRY);
assert.equal(remedyForFailure(undefined), FAILURE_REMEDY.RETRY);

// Case-insensitive: these strings reach the UI through a DB round-trip and a
// JSON envelope, and nothing guarantees the original casing survives.
assert.equal(remedyForFailure(noTarget.toUpperCase()), FAILURE_REMEDY.START_SESSION);

// Precedence: "no zellij at all" outranks "no such tab" when a message somehow
// carries both, because starting a session inside a terminal that isn't
// running cannot work.
assert.equal(
  remedyForFailure(`${FOCUS_FAILURE_PHRASE.NO_SUCH_TARGET} / ${FOCUS_FAILURE_PHRASE.NO_TERMINAL}`),
  FAILURE_REMEDY.START_TERMINAL,
);

console.log("✓ focus-failure tests passed");
