/**
 * Inline self-test: a dispatch that never reached an agent must not be
 * recorded as the agent timing out.
 *
 * THE CONFLATION
 * --------------
 * `timeout` claimed one thing — "an agent ran and ran out of time" — while
 * covering two: that, and "no agent ever saw this prompt". Measured
 * 2026-08-26: **29 of 157 timeouts** were provably in the second class, where
 * "provably" means the runner ITSELF acked the command `verified: false`.
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
 * Run: npx tsx scripts/test/undelivered-outcome.ts
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
  ORCHESTRATION_OUTCOMES.includes(ORCHESTRATION_OUTCOME.UNDELIVERED),
  "`undelivered` must be part of the canonical outcome vocabulary",
);
assert(
  (OUTCOMES as readonly string[]).includes("undelivered"),
  "src/lib/events.ts OUTCOMES must mirror the contract — it is the wire and " +
    "activity vocabulary, and a value the DB can hold but the parser cannot " +
    "name gets silently rewritten to something else on the way out.",
);

// ── It is still a failure of the RUN, so nothing gets quieter ──────────────
//
// The temptation is to make `undelivered` neutral, since the project did
// nothing wrong. That would be worse than the bug: a delivery path that drops
// prompts would stop registering anywhere at all, and dispatches would keep
// firing into it forever. The run produced nothing; the brake should stop.
assert(
  isFailingOutcome("undelivered"),
  "`undelivered` must count as a failing outcome. A dispatch that vanished " +
    "produced nothing, and the failure brake exists to stop firing into a path " +
    "that is dropping work. Making it neutral would trade a misattributed " +
    "alarm for silence, which is the worse failure.",
);
assert(
  ladderEffectForClose("undelivered").kind === "advance",
  "ladder and brake must still agree on `undelivered` (see " +
    "escalation-ladder-reset.ts — they are documented as counting the same " +
    "events and diverging is how the last bug happened)",
);

// ── But it must not TELL AN AGENT that its own work failed ─────────────────

{
  const block = renderEscalationBlock({
    level: "replan",
    failStreak: 3,
    lastError: null,
    lastOutcome: "undelivered",
  });
  assert(block !== null, "a non-human rung still renders a block");
  assert(
    /never reached an agent/i.test(block!),
    "the escalation block must say the dispatches never reached an agent",
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
  ACTIVITY_OUTCOME_LABEL.undelivered !== undefined &&
    !/timed out/i.test(ACTIVITY_OUTCOME_LABEL.undelivered),
  "Activity must label `undelivered` as its own thing, not as a timeout",
);

const activityCode = codeOf("src/lib/activity-events.ts");
assert(
  /known:\s*ActivityOutcome\[\]\s*=\s*\[[^\]]*"undelivered"/.test(activityCode),
  "activity-events' `known` list must include `undelivered`. It is a runtime " +
    "allow-list, not a type — an outcome missing from it falls through to the " +
    "`payload.error` branch and is displayed as a plain `error`, which is " +
    "exactly the misattribution this change removes.",
);

const statusCode = codeOf("src/lib/dispatch-status.ts");
assert(
  /case "undelivered":/.test(statusCode),
  "dispatch-status must handle `undelivered` explicitly. Its switch has a " +
    "`default`, so a missing case compiles and silently renders " +
    "'Run closed — outcome missing'.",
);

const workPhaseCode = codeOf("src/lib/feedback/work-phase.ts");
assert(
  /ORCHESTRATION_OUTCOME\.UNDELIVERED/.test(workPhaseCode),
  "work-phase must handle `undelivered` before its generic error branch, or " +
    "the operator is told 'the run ended without a successful fix' about a run " +
    "that never began.",
);

// ── The reaper must actually stamp it ──────────────────────────────────────

const reaperCode = codeOf("src/db/queries/orchestration-runs.ts");
assert(
  /WHEN \$\{runNeverStarted\} THEN 'undelivered'/.test(reaperCode),
  "the reaper must stamp `undelivered` when the runner reported the run as " +
    "never started. It already computes `runNeverStarted` for the staleness " +
    "predicate — this is the line that stops it from throwing that fact away.",
);
assert(
  reaperCode.indexOf("THEN 'partial'") < reaperCode.indexOf("THEN 'undelivered'"),
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
assert(
  journal.entries.some((e) => e.tag === "0058_undelivered_backfill"),
  "migration 0058 exists on disk but is not registered in " +
    "drizzle/meta/_journal.json, so the deploy will never apply it and the " +
    "backfill will silently not happen.",
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

console.log("✓ undelivered: a prompt that never arrived is not an agent timeout");
