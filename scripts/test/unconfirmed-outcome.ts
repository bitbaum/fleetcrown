/**
 * Inline self-test: a run no agent was ever seen working on must not be
 * recorded as the agent timing out.
 *
 * THE CONFLATION
 * --------------
 * `timeout` claimed one thing — "an agent ran and ran out of time" — while
 * covering two: that, and "the prompt was injected and nothing was ever
 * observed picking it up". Measured 2026-08-26: **29 of 157 timeouts** were
 * the second, where the runner ITSELF acked the command `verified: false`.
 *
 * NOTE THE CEILING ON THAT CLAIM. The runner's ack reads
 * `{"ok": true, "text": "injected to running claude (pty)", "verified": false}`
 * — it injected, and could only fail to CONFIRM. So this outcome is
 * `unconfirmed`, not `undelivered`: the latter is a stronger signal that
 * already exists (a runner NACK, `ok: false` → closeRunUndelivered) and this
 * evidence does not reach it. A first draft used that name and asserted the
 * prompt "never reached an agent", which the data does not support.
 *
 * The reaper already computed that fact (`runNeverStarted`, used to disqualify
 * liveness sheltering) and then discarded it when choosing the label. So the
 * blame landed on the project: those runs advanced escalation ladders,
 * darkened outcome streaks, and taught every downstream consumer that the
 * project was failing. surf-your-life reached the ladder's `human` rung with
 * ten never-delivered dispatches behind it.
 *
 * That is also why this matters beyond cosmetics: this history is the training
 * input for the nightly improver (#136). An improver cannot learn "the runner
 * drops prompts" from a column that says "the agent timed out".
 *
 * Run: npx tsx scripts/test/unconfirmed-outcome.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { ORCHESTRATION_OUTCOME, ORCHESTRATION_OUTCOMES } from "@/lib/orchestration/contract";
import { OUTCOMES, isFailingOutcome } from "@/lib/events";
import { ladderEffectForClose, renderEscalationBlock } from "@/lib/orchestration/escalation-ladder";
import { ACTIVITY_OUTCOME_LABEL } from "@/lib/activity-events";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "../..");

function codeOf(relPath: string): string {
  return readFileSync(resolvePath(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

// ── The vocabulary carries the fact ────────────────────────────────────────

assert(
  ORCHESTRATION_OUTCOMES.includes(ORCHESTRATION_OUTCOME.UNCONFIRMED),
  "`unconfirmed` must be part of the canonical outcome vocabulary",
);
assert(
  (OUTCOMES as readonly string[]).includes("unconfirmed"),
  "src/lib/events.ts OUTCOMES must mirror the contract — it is the wire and " +
    "activity vocabulary, and a value the DB can hold but the parser cannot " +
    "name gets silently rewritten to something else on the way out.",
);

// ── It is still a failure of the RUN, so nothing gets quieter ──────────────
//
// The temptation is to make `unconfirmed` neutral, since the project did
// nothing wrong. That would be worse than the bug: a delivery path that drops
// prompts would stop registering anywhere at all, and dispatches would keep
// firing into it forever. The run produced nothing; the brake should stop.
assert(
  isFailingOutcome("unconfirmed"),
  "`unconfirmed` must count as a failing outcome. A dispatch that vanished " +
    "produced nothing, and the failure brake exists to stop firing into a path " +
    "that is dropping work. Making it neutral would trade a misattributed " +
    "alarm for silence, which is the worse failure.",
);
assert(
  ladderEffectForClose("unconfirmed").kind === "advance",
  "ladder and brake must still agree on `unconfirmed` (see " +
    "escalation-ladder-reset.ts — they are documented as counting the same " +
    "events and diverging is how the last bug happened)",
);

// ── But it must not TELL AN AGENT that its own work failed ─────────────────

{
  const block = renderEscalationBlock({
    level: "replan",
    failStreak: 3,
    lastError: null,
    lastOutcome: "unconfirmed",
  });
  assert(block !== null, "a non-human rung still renders a block");
  assert(
    /never picked up by an agent/i.test(block!),
    "the escalation block must say the dispatches were never picked up",
  );
  assert(
    !/never reached an agent/i.test(block!),
    "the block must not claim the prompt never REACHED an agent — the runner " +
      "acked that it injected, and could only fail to confirm. Overclaiming " +
      "here is the same defect in a different place.",
  );
  assert(
    !/the current approach is not working/i.test(block!) &&
      !/Do NOT retry the same approach/i.test(block!),
    "the block must NOT tell the agent to re-plan or stop retrying its own " +
      "approach when the streak was built from prompts it never received — " +
      "that sends it looking for a defect in work that was never done.",
  );
}

{
  // The ordinary path must be untouched: a real failure still gets real advice.
  const normal = renderEscalationBlock({
    level: "replan",
    failStreak: 3,
    lastError: "tsc failed",
    lastOutcome: "timeout",
  });
  assert(
    normal !== null && /re-plan|not working/i.test(normal),
    "a genuine failure streak must still receive the rung's instruction",
  );
}

// ── Every consumer names it, rather than defaulting ────────────────────────

assert(
  ACTIVITY_OUTCOME_LABEL.unconfirmed !== undefined &&
    !/timed out/i.test(ACTIVITY_OUTCOME_LABEL.unconfirmed),
  "Activity must label `unconfirmed` as its own thing, not as a timeout",
);

// The name must not be the STRONGER one. `undelivered` is already the codebase's
// word for a runner NACK — a prompt that provably never landed — and reusing it
// for "injected but unconfirmed" puts two different confidences behind one word.
assert(
  !(ORCHESTRATION_OUTCOMES as readonly string[]).includes("undelivered"),
  "`undelivered` must not be an orchestration OUTCOME: closeRunUndelivered " +
    "already owns that word for the stronger runner-NACK signal, and the " +
    "verified:false evidence does not reach it.",
);

const activityCode = codeOf("src/lib/activity-events.ts");
assert(
  /known:\s*ActivityOutcome\[\]\s*=\s*\[[^\]]*"unconfirmed"/.test(activityCode),
  "activity-events' `known` list must include `unconfirmed`. It is a runtime " +
    "allow-list, not a type — an outcome missing from it falls through to the " +
    "`payload.error` branch and is displayed as a plain `error`, which is " +
    "exactly the misattribution this change removes.",
);

const statusCode = codeOf("src/lib/dispatch-status.ts");
assert(
  /case "unconfirmed":/.test(statusCode),
  "dispatch-status must handle `unconfirmed` explicitly. Its switch has a " +
    "`default`, so a missing case compiles and silently renders " +
    "'Run closed — outcome missing'.",
);

const workPhaseCode = codeOf("src/lib/feedback/work-phase.ts");
assert(
  /ORCHESTRATION_OUTCOME\.UNCONFIRMED/.test(workPhaseCode),
  "work-phase must handle `unconfirmed` before its generic error branch, or " +
    "the operator is told 'the run ended without a successful fix' about a run " +
    "that never began.",
);

// ── The reaper must actually stamp it ──────────────────────────────────────

const reaperCode = codeOf("src/db/queries/orchestration-runs.ts");
assert(
  /WHEN \$\{runNeverStarted\} THEN 'unconfirmed'/.test(reaperCode),
  "the reaper must stamp `unconfirmed` when the runner reported the run as " +
    "never started. It already computes `runNeverStarted` for the staleness " +
    "predicate — this is the line that stops it from throwing that fact away.",
);
assert(
  reaperCode.indexOf("THEN 'partial'") < reaperCode.indexOf("THEN 'unconfirmed'"),
  "the handoff check must be evaluated BEFORE the never-started check: " +
    "evidence that work landed outranks an ack claiming it never did.",
);

// ── A hand-written migration that is not journalled never runs ─────────────
//
// 0058 has no DDL, so drizzle-kit generated nothing and both the file and its
// journal entry were written by hand. A file without an entry is applied by
// NOTHING and fails completely silently — the deploy goes green having done
// nothing at all.
const journal = JSON.parse(
  readFileSync(resolvePath(repoRoot, "drizzle/meta/_journal.json"), "utf8"),
) as { entries: { tag: string }[] };
for (const tag of ["0058_undelivered_backfill", "0059_unconfirmed_rename"]) {
  assert(
    journal.entries.some((e) => e.tag === tag),
    `migration ${tag} exists on disk but is not registered in ` +
      "drizzle/meta/_journal.json, so the deploy will never apply it and the " +
      "relabel will silently not happen.",
  );
}

const rename = readFileSync(
  resolvePath(repoRoot, "drizzle/0059_unconfirmed_rename.sql"),
  "utf8",
);
assert(
  /SET "outcome" = 'unconfirmed'/.test(rename) && /WHERE "outcome" = 'undelivered'/.test(rename),
  "0059 must relabel exactly the rows 0058 wrote, and nothing else",
);

const backfill = readFileSync(
  resolvePath(repoRoot, "drizzle/0058_undelivered_backfill.sql"),
  "utf8",
);
assert(
  /WHERE r\."outcome" = 'timeout'/.test(backfill),
  "the backfill must only relabel rows that are currently `timeout` — it must " +
    "never touch a success, partial or error",
);
assert(
  /result"->>'verified' = 'false'/.test(backfill),
  "the backfill must key off the runner's own ack, not an inference. Absence " +
    "of a delivery stamp is NOT evidence of non-delivery: payload.deliveredAt " +
    "was stamped on only 77% of successes over 60 days, so relabelling from " +
    "its absence would have rewritten history from a gap in instrumentation.",
);

console.log("✓ unconfirmed: a run no agent was seen working on is not an agent timeout");
