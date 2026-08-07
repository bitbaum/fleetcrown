/**
 * Deterministic evidence pre-check — runs BEFORE the cross-model DoD judge.
 *
 * Measured on prod 2026-08-07 (254 runs, 51 graded): **64.6% of every rejection
 * reason was "the work is not evidenced in the handoff"**, not "the work is
 * wrong". The dominant bar in the fleet (46 of 51 graded runs) is
 * `npm run verify` passes, with its real output in the handoff (lint:/tsc:/tests:)`
 * — a well-specified, mechanically checkable bar. So the majority failure mode
 * is not a judgement call at all: a required field is simply *empty*.
 *
 * Two things follow, and they are the whole reason this module exists.
 *
 * 1. **Cost.** Sending an empty handoff to an LLM judge to be told "no evidence"
 *    spends a model call to reach a conclusion a string check reaches for free.
 *    The judge's own system prompt already says "Missing evidence = not done",
 *    so short-circuiting here is behaviour-preserving in exactly this case.
 *
 * 2. **Learnability — the more important one.** Those 48 rejections produced 48
 *    DISTINCT free-text gap sentences. Zero repetition. That is why the run
 *    corpus could not be used to improve prompts: an optimiser needs recurring,
 *    groupable signal, and every rejection was a unique snowflake authored by a
 *    model. A deterministic pre-check emits a STABLE `gapCode`
 *    (e.g. `evidence:lint+tsc`), which turns the dominant two-thirds of
 *    rejections from free text into a small closed set of categories you can
 *    COUNT. That is the precondition for learning from this corpus later.
 *
 * Deliberately conservative — it fails SAFE toward letting the model judge:
 *   - It only fires on fields that are genuinely absent/blank. The handoff
 *     contract tells agents to write an honest impossibility verbatim ("no
 *     suite", "deploy not configured") rather than omit the field, and that IS
 *     compliance — so any non-blank value satisfies the pre-check and the run
 *     proceeds to the real judge.
 *   - It only demands a field when the project's own bar asks for that check.
 *     A bar that never mentions linting never trips the lint pre-check.
 *   - When nothing is demanded, or everything demanded is present, it returns
 *     null and the cross-model judge runs exactly as before.
 *
 * It never upgrades a run — it can only ever produce `met: false`.
 *
 * Replayed against all 51 graded prod runs it fired on 48 and deferred on 3,
 * agreeing with the model judge on 47 and disagreeing once: a run the judge
 * passed whose `lint:` and `tsc:` were both blank against a bar that names
 * those fields explicitly. That disagreement is in the direction this gate
 * exists to enforce (an unevidenced claim is indistinguishable from work not
 * done), so it is not softened away — but it is a real behaviour change and is
 * recorded here rather than claimed as pure agreement.
 *
 * ORDERING NOTE — this only became a fair rule on 2026-08-07. Before then the
 * prompts never asked for `tsc:`/`lint:`/`commit:` as field lines, so those
 * fields were blank on ~94% of runs and enforcing them would have punished
 * agents for an instruction bug. The prompt fix ships together with this, and
 * scripts/test/handoff-fields.ts keeps the two in lockstep. Never enforce a
 * field the agent was not asked to write.
 */
import type { OrchestrationTaskSummary } from "./contract";

/** Recorded as the "judge" when the deterministic pre-check decided, so the
 *  surfaced verdict never claims a model looked at something it didn't. */
export const EVIDENCE_PRECHECK_ID = "precheck:evidence";

type Demand = {
  /** Stable, groupable token used to build `gapCode`. */
  code: string;
  /** The handoff field that satisfies this demand. */
  field: keyof OrchestrationTaskSummary;
  /** How the field is named to the agent, matching the handoff contract. */
  label: string;
  /** Does the project's bar ask for this check? */
  demandedBy: RegExp;
};

/**
 * `verify` is treated as bundling lint + typecheck + tests because that is what
 * the repo-standard `verify` script is defined to be across this fleet, and the
 * dominant bar names it by that word.
 */
const VERIFY_BUNDLE = /\bverif(y|ies|ied)\b/i;

const DEMANDS: Demand[] = [
  { code: "lint", field: "lint", label: "lint:", demandedBy: /\blint(ing|er)?\b/i },
  { code: "tsc", field: "tsc", label: "tsc:", demandedBy: /\b(tsc|typecheck|type[-\s]?check|typescript)\b/i },
  { code: "tests", field: "tests", label: "tests:", demandedBy: /\b(test|tests|suite|suites|spec|specs)\b/i },
  { code: "commit", field: "commit", label: "commit:", demandedBy: /\b(commit|commits|committed|push|pushed)\b/i },
];

/**
 * The handoff fields this gate can ever demand. Exported so
 * scripts/test/handoff-fields.ts can assert the prompt library actually ASKS
 * for every field the gate can reject you for leaving blank. Enforcing a field
 * the agent was never told to write is what produced 64.6% of all rejections
 * before 2026-08-07; the test makes that state unreachable rather than merely
 * fixed once.
 */
export const DEMANDABLE_EVIDENCE_FIELDS: readonly string[] = DEMANDS.map((d) => d.field as string);

export type EvidencePrecheckResult = {
  /** Handoff field labels the bar demands but the handoff leaves blank. */
  missing: string[];
  /** Human-readable gap, in the same voice as the model judge's `gap`. */
  gap: string;
  /** Stable category token, e.g. `evidence:lint+tsc`. Groupable across runs. */
  gapCode: string;
};

/** A field counts as evidenced when it carries ANY non-blank text. */
function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/**
 * Return the deterministic evidence gap, or null to defer to the model judge.
 *
 * Returning null is the "I cannot decide this cheaply" answer and is the common
 * case once agents comply — it is not an approval.
 */
export function precheckEvidence(
  definitionOfDone: string | null | undefined,
  summary: OrchestrationTaskSummary | undefined,
): EvidencePrecheckResult | null {
  const dod = (definitionOfDone ?? "").trim();
  if (!dod) return null;

  const bundled = VERIFY_BUNDLE.test(dod);
  const missing: Demand[] = [];

  for (const demand of DEMANDS) {
    // `commit` is never part of the verify bundle — pushing is a separate act
    // from the checks passing, so it must be named explicitly by the bar.
    const demanded = demand.code === "commit"
      ? demand.demandedBy.test(dod)
      : bundled || demand.demandedBy.test(dod);
    if (!demanded) continue;
    if (isBlank(summary?.[demand.field])) missing.push(demand);
  }

  if (missing.length === 0) return null;

  const labels = missing.map((m) => m.label);
  const gap =
    `The handoff leaves ${labels.map((l) => `\`${l}\``).join(", ")} empty, and the Definition of Done requires ` +
    `the real output of those checks. Run them and record the actual result in each field — ` +
    `or, if a check genuinely cannot run here, write that verbatim (e.g. "no suite") rather than leaving it blank.`;

  return {
    missing: labels,
    gap,
    gapCode: `evidence:${missing.map((m) => m.code).join("+")}`,
  };
}
