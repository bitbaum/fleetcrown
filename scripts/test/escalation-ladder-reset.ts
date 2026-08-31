/**
 * Inline self-test: an escalation ladder must be possible to LEAVE.
 *
 * THE BUG THIS LOCKS DOWN
 * -----------------------
 * The ladder advanced on `isFailingOutcome(outcome)` but resolved only on
 * `outcome === "success"`. Two locally sensible rules — "incomplete work is not
 * a failure" and "don't declare victory early" — composed into a state with no
 * exit, because `partial` satisfied neither predicate. And `partial` is the
 * most common outcome there is: 52 of 117 closes measured 2026-08-26.
 *
 * Result: seventeen ladders open at once, not one of them with a single
 * `success` since opening. surf-your-life sat at the top rung for 13 days while
 * completing 7 runs' worth of real work; orangecat's open rungs kept injecting
 * "your previous run FAILED" into the dispatch prompts of a working project.
 *
 * Nobody asked the question that catches this class: transitions were checked
 * for correctness, but nobody asked whether every state can be LEFT.
 *
 * The tests below are therefore mostly about a PROPERTY, not the one example:
 * advancing and resolving must be governed by a single predicate, so a new
 * outcome added later cannot land in the gap between them.
 *
 * Run: npx tsx scripts/test/escalation-ladder-reset.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import {
  ladderEffectForClose,
  levelForStreak,
  ESCALATION_HUMAN_STREAK,
} from "@/lib/orchestration/escalation-ladder";
import { leadingFailureStreak } from "@/lib/orchestration/dispatch-gates";
import { isFailingOutcome } from "@/lib/events";
import { ORCHESTRATION_OUTCOMES } from "@/lib/orchestration/contract";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "../..");

/** Source with comments removed — a rule must never be satisfied by the prose
 *  that explains it. Learned twice: a gate matched `fetch-depth: 0` inside its
 *  own justification, and a husky check matched a counter-example it quoted. */
function codeOf(relPath: string): string {
  return readFileSync(resolvePath(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// ── The regression itself ───────────────────────────────────────────────────

assert(
  ladderEffectForClose("partial").kind === "resolve",
  "a `partial` close must RESOLVE the ladder — real work landed. Requiring " +
    "`success` is what left seventeen ladders open with no way out.",
);

assert(
  ladderEffectForClose("partial").kind !== "advance",
  "`partial` must not advance the ladder either — it is not a failure.",
);

{
  const effect = ladderEffectForClose("partial");
  assert(
    effect.kind === "resolve" && effect.by === "progress",
    "a `partial` close resolves as 'progress', not 'success' — the ladder is " +
      "closed by evidence of movement, and conflating that with meeting the " +
      "definition of done would make 'did escalating help?' unanswerable.",
  );
}

{
  const effect = ladderEffectForClose("success");
  assert(
    effect.kind === "resolve" && effect.by === "success",
    "a successful close resolves the ladder as 'success'",
  );
}

// ── The property, not just the example ──────────────────────────────────────

for (const outcome of ORCHESTRATION_OUTCOMES) {
  const effect = ladderEffectForClose(outcome);
  assert(
    (effect.kind === "advance") === isFailingOutcome(outcome),
    `outcome "${outcome}": advancing must be exactly isFailingOutcome. It ` +
      `advanced=${effect.kind === "advance"} while isFailingOutcome=${isFailingOutcome(outcome)}.`,
  );
  assert(
    effect.kind !== "ignore" || outcome === "user_abort",
    `outcome "${outcome}" falls through to 'ignore', so it can neither advance ` +
      `a ladder nor clear one — the exact gap that trapped \`partial\`. Every ` +
      `outcome must advance or resolve, except the deliberately neutral ` +
      `user_abort.`,
  );
}

// A human choosing to stop is evidence of nothing about the project.
assert(
  ladderEffectForClose("user_abort").kind === "ignore",
  "user_abort is neutral: it must neither advance the ladder nor clear it",
);

assert(ladderEffectForClose(null).kind === "ignore", "a run with no outcome is not a close");
assert(ladderEffectForClose(undefined).kind === "ignore", "an absent outcome is not a close");

// ── Ladder and brake must agree, which the code has always CLAIMED ──────────
//
// orchestration-runs.ts said "isFailingOutcome is the same predicate the
// failure brake uses, so ladder rungs and brake streak count the same events."
// That was true for advancing and false for resetting: leadingFailureStreak
// stops at the first non-failing outcome, so the brake always reset on
// `partial` while the ladder did not. This makes the claim enforceable.
for (const outcome of ORCHESTRATION_OUTCOMES) {
  const brakeCounts = leadingFailureStreak([outcome]) > 0;
  const ladderAdvances = ladderEffectForClose(outcome).kind === "advance";
  assert(
    brakeCounts === ladderAdvances,
    `outcome "${outcome}": the failure brake and the escalation ladder ` +
      `disagree (brake counts it=${brakeCounts}, ladder advances=${ladderAdvances}). ` +
      `They are documented as counting the same events and must actually do so.`,
  );
}

// A ladder that resolves must be re-enterable from the bottom, or "resolve"
// would silently mean "disable escalation for this project forever".
assert(levelForStreak(1) === "retry", "a fresh failure re-opens the ladder at rung 1");
assert(levelForStreak(ESCALATION_HUMAN_STREAK) === "human", "the top rung is reachable");
assert(levelForStreak(0) === null, "a zero streak has no rung");

// ── The wiring: both close paths must go through the one predicate ──────────

const runsCode = codeOf("src/db/queries/orchestration-runs.ts");

assert(
  !/resolveEscalation\([^)]*"success"\)/.test(runsCode),
  'orchestration-runs.ts still resolves the ladder with a hardcoded "success". ' +
    "That is the original bug: it makes `partial` a close that neither advances " +
    "nor clears. Route it through ladderEffectForClose instead.",
);

assert(
  (runsCode.match(/ladderEffectForClose\(/g) ?? []).length >= 2,
  "both close paths must consult ladderEffectForClose — the funnel in " +
    "updateOrchestrationRun AND the reaper loop in cleanupStaleOrchestrationRuns. " +
    "The reaper bypasses the funnel, so a rule applied in only one place is a " +
    "rule that half the closes ignore.",
);

// ── The invariant the ladder always assumed ────────────────────────────────

const schemaCode = codeOf("src/db/schema/run-escalations.ts");
assert(
  /uniqueIndex\(\s*"uq_run_escalations_one_open_per_project"/.test(schemaCode),
  "the one-open-ladder-per-project invariant must be enforced by a unique " +
    "index, not merely intended. advanceEscalation read-then-inserts and the " +
    "reaper fires it without awaiting, so concurrent closes created parallel " +
    "ladders (orangecat held three) and split one project's streak across them.",
);

const escalationQueryCode = codeOf("src/db/queries/run-escalations.ts");
assert(
  /onConflictDoNothing/.test(escalationQueryCode),
  "advanceEscalation must tolerate the unique index rejecting a racing insert. " +
    "Without onConflict handling the index turns a silent duplicate into a " +
    "thrown error on a real close path.",
);

// ── The migration must repair BEFORE it constrains ─────────────────────────
//
// Creating the unique index against production as it stands fails outright:
// duplicates already exist. An ordering bug here is invisible in review and
// fatal on deploy.
const migration = readFileSync(resolvePath(repoRoot, "drizzle/0057_loose_spyke.sql"), "utf8");
const indexAt = migration.indexOf("CREATE UNIQUE INDEX");
const progressRepairAt = migration.indexOf("'progress'");
const dedupeRepairAt = migration.indexOf("'superseded'");

assert(indexAt > -1, "migration 0057 must create the unique index");
assert(
  progressRepairAt > -1 && progressRepairAt < indexAt,
  "migration 0057 must retro-resolve earned-out ladders BEFORE creating the " + "unique index",
);
assert(
  dedupeRepairAt > -1 && dedupeRepairAt < indexAt,
  "migration 0057 must collapse race duplicates BEFORE creating the unique " +
    "index — otherwise index creation fails on the existing rows and the " +
    "deploy rolls back.",
);

console.log("✓ escalation ladder: every state can be left, and both close paths agree");
