/**
 * The clause that lets Loki hold an opinion.
 *
 * Production, asked "what do you think about heidi":
 *
 *     An opinion or assessment is: Not in your data.
 *
 * The model was obeying `buildContract` exactly — rule 1 says every claim must
 * cite a record, rule 3 says anything with no supporting record gets exactly
 * "Not in your data." An opinion is not a record, so it looked one up, failed,
 * and refused.
 *
 * These checks are structural, not stylistic. They assert the narrowing is
 * PRESENT, that it sits INSIDE the contract section (a rule placed after the
 * line "this overrides every formatting instruction below" is outranked by the
 * thing it is narrowing), and that both grounded paths get it. A prompt whose
 * wording drifts is fine; a prompt that silently loses this clause is the
 * original bug returning.
 *
 * Pure: no model, no database.
 */
import { buildLokiContext, JUDGMENT_RULES } from "@/lib/agent/grounded-context";
import type { Fact } from "@bitbaum/ai-kit/grounding";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
    failures++;
  }
}

const facts: Fact[] = [
  {
    id: "F1",
    subject: "heidi",
    kind: "project",
    fields: { name: "heidi", summary: "Learn Zurich Swiss German" },
  } as unknown as Fact,
];

const ctx = buildLokiContext({
  facts,
  directives: [],
  renderedFacts: "- [F1] heidi — Learn Zurich Swiss German",
});

console.log("loki judgment contract");

check("the narrowing is present", ctx.includes(JUDGMENT_RULES));

// The contract announces that it overrides everything BELOW it. A narrowing
// that lands after the records is therefore outranked by the rule it narrows.
const contractSection = ctx.split("\n\n---\n\n")[0] ?? "";
check(
  "it sits inside the contract section, not after the records",
  contractSection.includes(JUDGMENT_RULES),
  "the clause must precede the first '---' separator or the contract outranks it",
);

check(
  "the original contract survives — this narrows, never replaces",
  ctx.includes("Every claim about the operator MUST cite a record id") &&
    ctx.includes("Grounding contract"),
);

check("the records still reach the model", ctx.includes("Learn Zurich Swiss German"));

// The four failures of the production answer, each named.
check(
  "it forbids answering a judgment request with the no-basis phrase",
  /never the answer to a request for JUDGMENT/i.test(ctx),
);
check(
  "it requires an assessment to show what it rests on",
  /Ground the judgment and show its footing/i.test(ctx),
);
check(
  "thin evidence is a hedge, not a refusal",
  /Thin evidence earns a hedge/i.test(ctx) && /never a refusal/i.test(ctx),
);
check(
  "a name-collision row must not be padded in as relevant",
  /matched only because a NAME contains/i.test(ctx),
);

check(
  "factual claims inside an assessment are still bound by rules 1-6",
  /Rules 1–6 still bind every FACTUAL claim/i.test(ctx),
);

// An empty turn must still be allowed to say it has nothing — the narrowing is
// about judgment, not a licence to answer with no records at all.
const emptyCtx = buildLokiContext({ facts: [], directives: [], renderedFacts: "" });
check(
  "with no records at all, the refusal instruction still stands",
  emptyCtx.includes("NO records were retrieved for this turn"),
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ loki judgment contract: all checks passed");
