/**
 * The grounding contract — the rules block that ships with every turn's facts.
 * MIRRORED MODULE (see core/README.md).
 *
 * Why this is generated rather than a hand-written constant: a standing prose
 * rule ("only use provided context") is a weak signal that models trade away
 * under format pressure. The failure that motivated this harness was exactly
 * that — a prompt demanding "1 focus, 3 tasks, 1 person, under 150 words, no
 * hedging" got four confidently-formatted answers, three of them invented,
 * against a context block that already said "if a question falls outside this
 * context, say so rather than guessing".
 *
 * The lesson: the model did not disobey a rule it forgot. It obeyed the
 * STRONGER of two conflicting instructions — fill five slots — because nothing
 * made the empty slot expressible. So this block does three things a static
 * prompt cannot:
 *
 *   1. Names the exact citation handles that exist this turn, so "cite a fact"
 *      is a closed-set choice rather than free text.
 *   2. Names the exact fields that are unrecorded THIS TURN, so the prohibition
 *      is concrete ("you have no affiliation for any person here") instead of
 *      abstract.
 *   3. Supplies the escape hatch verbatim, so refusing a slot is a cheaper
 *      token path than inventing one.
 */
import { NOT_RECORDED, unrecordedFields, type Fact } from "./facts";

/** The exact string the model must emit when a slot cannot be filled. */
export const NO_BASIS = "Not in your data.";

/**
 * Build the contract for a specific fact set. Empty fact sets get the strictest
 * form — with nothing retrieved, EVERY answer must be a refusal, and saying so
 * plainly beats hoping the model notices the context block is empty.
 */
export function buildContract(facts: Fact[]): string {
  const ids = facts.map((f) => `[${f.id}]`).join(" ");
  const gaps = unrecordedFields(facts);

  const rules = [
    "## Grounding contract — this overrides every formatting instruction below",
    "",
    "You are answering from a fixed set of records. They are the ONLY things you know about the operator.",
    "",
    facts.length === 0
      ? `1. NO records were retrieved for this turn. You therefore cannot answer any question about the operator's projects, people, goals, habits, commitments or events. Reply "${NO_BASIS}" and say what you would need.`
      : `1. Every claim about the operator MUST cite a record id. Legal citations this turn, and no others: ${ids}`,
    `2. A field shown as \`${NOT_RECORDED}\` means you DO NOT KNOW it. Never supply a value for it — not from the record's own wording, not from a name that looks like a place or an organisation, not from general knowledge about a similarly-named person. A surname is not an employer.`,
    `3. If any part of the request has no supporting record, answer that part with exactly "${NO_BASIS}" and continue with the parts you can support. A requested format NEVER obliges you to invent an item. Returning three of five requested items, each cited, is a correct and complete answer.`,
    "4. Do not describe a person's role, employer, seniority, or history unless a record field states it. Do not infer an organisation from a name.",
    "5. You have not browsed the web this turn. If asked to research someone, say you cannot and report only what the records hold.",
    "6. If you are correcting an earlier answer, the correction is subject to every rule above — cite the record, or say the record does not exist.",
  ];

  if (gaps.length > 0) {
    rules.push(
      "",
      `Unrecorded in THIS turn's records — you have no value for any of these and must not state one: ${gaps.join(", ")}`,
    );
  }

  return rules.join("\n");
}

/**
 * A deterministic answer computed by the app, not the model.
 *
 * Some questions are not judgment calls at all. "Which goals are stuck at 0%
 * for 30+ days", "what is due in the next 3 days", "which habit is at risk"
 * are SQL predicates with exact answers, and asking a language model to derive
 * them from injected prose is strictly worse than computing them: it can only
 * introduce error. The model's job is to PHRASE the result, not to derive it.
 *
 * `answer` is empty when the query ran and found nothing — which is itself a
 * real, citable answer ("nothing is due"), and crucially different from the
 * query never having run.
 */
export type Directive = {
  /** What was asked, in the app's words: "goals stuck 30+ days". */
  question: string;
  /** Computed result lines. Empty array = ran, found nothing. */
  answer: string[];
  /** How it was computed, shown to the model so it can be honest about method. */
  method: string;
};

/**
 * Render computed answers. These are stated as settled, because they are: the
 * model must not re-derive, second-guess, or "improve" them, and an empty
 * result must be reported as an empty result rather than backfilled from the
 * fact set.
 */
export function renderDirectives(directives: Directive[]): string {
  if (directives.length === 0) return "";
  const blocks = directives.map((d) => {
    const body =
      d.answer.length > 0
        ? d.answer.map((a) => `     - ${a}`).join("\n")
        : "     (none — the query ran and matched nothing)";
    return `  ${d.question}   [${d.method}]\n${body}`;
  });
  return [
    "## Computed answers — already resolved, do not re-derive",
    "These were computed directly from the database for this turn. They are exact.",
    "Report them as given. Where the result is empty, say so plainly — do not substitute a plausible item from the records.",
    "",
    ...blocks,
  ].join("\n");
}

/**
 * Assemble the full grounded context: contract, computed answers, then records.
 *
 * Order is deliberate and load-bearing. The contract comes FIRST so it frames
 * everything read afterwards, and the records come LAST so they sit closest to
 * the user's question — the position small models weight most heavily.
 */
export function buildGroundedContext(input: {
  facts: Fact[];
  directives?: Directive[];
  renderedFacts: string;
}): string {
  return [
    buildContract(input.facts),
    renderDirectives(input.directives ?? []),
    input.facts.length > 0
      ? ["## Records", "", input.renderedFacts].join("\n")
      : "## Records\n\n(none retrieved)",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}
