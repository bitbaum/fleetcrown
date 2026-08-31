/**
 * Adversarial groundedness suite for the agent harness.
 * Run: npx tsx scripts/test/agent-grounding.ts
 *
 * Every case here is taken VERBATIM from a real Loki failure (2026-08-13), in
 * which Loki answered a five-part "plan my day" prompt with three fabricated
 * answers and then produced a fabricated correction when challenged. The
 * fabrications were not exotic — they are the ordinary failure mode of a model
 * asked to fill a rigid format against thin context, which is exactly what a
 * small/free model does most.
 *
 * The traced ground truth for those claims:
 *   - "rotate the expired GROQ_API_KEY, it blocks truthseeker" — the key
 *     returned HTTP 200 when tested. Both cited .env paths were invented.
 *   - "Ilya Druzhnikov (UZH)" — the record has no org field and the string
 *     "UZH" exists nowhere in the operator's data. It is the substring inside
 *     dr-UZH-nikov, i.e. a keyword-match artifact.
 *   - "Elena Weber — Accelerator & Bridge Program Manager, University of
 *     Liechtenstein alumna, START Summit jury" — the record is a display name
 *     and a phone number. Nothing else. No web search was performed.
 *
 * These assertions are the contract: if the harness stops catching them, the
 * product has regressed to the state that produced that transcript.
 */
import assert from "node:assert/strict";
import {
  makeFact,
  assignFactIds,
  renderFacts,
  unrecordedFields,
  NOT_RECORDED,
} from "../../src/lib/agent/core/facts";
import {
  buildContract,
  buildGroundedContext,
  renderDirectives,
  buildAssistantRules,
  NO_BASIS,
} from "../../src/lib/agent/core/contract";
import { verifyAnswer, buildRepairPrompt } from "../../src/lib/agent/core/verify";

// ── The real records, exactly as FleetCrown stores them ──────────────────────
const FACTS = assignFactIds([
  makeFact({
    kind: "person",
    subject: "Elena Weber SINGA Switzerland",
    source: "people table",
    values: { name: "Elena Weber SINGA Switzerland", channels: "whatsapp +41774730093" },
  }),
  makeFact({
    kind: "person",
    subject: "Ilya Druzhnikov",
    source: "people table",
    values: { name: "Ilya Druzhnikov", channels: "whatsapp +16508620988" },
  }),
  makeFact({
    kind: "project",
    subject: "truthseeker",
    source: "projects table",
    values: { name: "truthseeker", status: "active", stack: "TypeScript" },
  }),
]);

const USER_MSG = "Plan my day. Who should I reach out to and why?";

// ── 1. Absence is rendered explicitly, not omitted ───────────────────────────
{
  const rendered = renderFacts(FACTS);
  assert.match(
    rendered,
    /affiliation: <not recorded>/,
    "affiliation must render as an explicit gap",
  );
  assert.match(rendered, /role: <not recorded>/, "role must render as an explicit gap");
  assert.match(
    rendered,
    /channels: whatsapp \+41774730093/,
    "stored values must survive rendering",
  );
  assert.equal(NOT_RECORDED, "<not recorded>");

  const gaps = unrecordedFields(FACTS);
  assert.ok(
    gaps.includes("person.affiliation"),
    "affiliation gap must be reported to the contract",
  );
  assert.ok(gaps.includes("person.role"), "role gap must be reported to the contract");
}

// ── 2. The contract names this turn's citations and gaps concretely ──────────
{
  const contract = buildContract(FACTS);
  assert.match(contract, /\[F1\] \[F2\] \[F3\]/, "legal citation ids must be enumerated");
  assert.match(contract, /person\.affiliation/, "the contract must name the concrete gap");
  assert.match(contract, /A surname is not an employer/, "the anti-UZH rule must be stated");
  assert.ok(contract.includes(NO_BASIS), "the refusal phrase must be supplied verbatim");

  // Empty retrieval must produce the strictest contract, not a permissive one.
  const empty = buildContract([]);
  assert.match(empty, /NO records were retrieved/, "empty context must be stated, not implied");
}

// ── 3. The UZH fabrication is caught ─────────────────────────────────────────
{
  const r = verifyAnswer({
    answer: "**Ilya Druzhnikov (UZH)** — Academic/research contact at University of Zurich. [F2]",
    facts: FACTS,
    userMessage: USER_MSG,
  });
  assert.equal(r.ok, false, "the UZH claim must be rejected");
  const flagged = r.violations.map((v) => v.text.toLowerCase()).join(" ");
  assert.match(flagged, /uzh/, "UZH itself must be flagged as a novel proper noun");
  assert.ok(
    r.violations.some((v) => /university of zurich/i.test(v.text)),
    "the expanded affiliation must also be flagged",
  );
}

// ── 4. The fabricated Elena Weber biography is caught ────────────────────────
{
  const r = verifyAnswer({
    answer: [
      "**Elena Weber** is the **Accelerator & Bridge Program Manager** at SINGA Switzerland.",
      "Background: University of Liechtenstein (START Alumna). Jury member at START Summit.",
      "Direct contact: +41 77 473 00 93.",
    ].join("\n"),
    facts: FACTS,
    userMessage: USER_MSG,
  });
  assert.equal(r.ok, false, "the invented biography must be rejected");
  const texts = r.violations.map((v) => v.text);
  assert.ok(
    texts.some((t) => /Accelerator/i.test(t)),
    "invented job title must be flagged",
  );
  assert.ok(
    texts.some((t) => /Liechtenstein/i.test(t)),
    "invented alma mater must be flagged",
  );
  assert.ok(
    texts.some((t) => /START Summit/i.test(t)),
    "invented jury role must be flagged",
  );

  // The genuinely-stored phone number must NOT be flagged, even though the
  // model reformatted it with spaces. Digit-level comparison covers that.
  assert.ok(
    !texts.some((t) => t.replace(/\D/g, "") === "41774730093"),
    "a real, stored phone number must pass even when reformatted",
  );
}

// ── 5. The invented Groq remediation is caught ───────────────────────────────
{
  const r = verifyAnswer({
    answer: [
      "**truthseeker** — rotate the expired GROQ_API_KEY.",
      "2. Update key in /opt/fleetcrown/runner/.env and /opt/fleet-runner/.env.",
    ].join("\n"),
    facts: FACTS,
    userMessage: USER_MSG,
  });
  assert.equal(r.ok, false, "invented file paths must be rejected");
  assert.ok(
    r.violations.some((v) => v.kind === "novel-path" && v.text.includes("/opt/fleetcrown/runner")),
    "the fabricated .env path must be flagged as a path claim",
  );
}

// ── 6. Fabricated CITATIONS are caught ───────────────────────────────────────
{
  const r = verifyAnswer({
    answer: "Reach out to Elena Weber [F9] — she runs the accelerator [F12].",
    facts: FACTS,
    userMessage: USER_MSG,
  });
  assert.ok(
    r.violations.filter((v) => v.kind === "unknown-citation").length === 2,
    "both citations to non-existent records must be flagged",
  );
}

// ── 7. The CORRECTION path is verified too ───────────────────────────────────
// When challenged, Loki produced a new assertion about the file's contents.
// It happened to be true, but it came from the same ungrounded process — the
// operator had no way to distinguish a real correction from a second
// fabrication. Corrections are claims and must clear the same bar.
{
  const bad = verifyAnswer({
    answer:
      "Correction: Ilya Druzhnikov is listed in data/contact-resolver.json with no UZH affiliation.",
    facts: FACTS,
    userMessage: "ilya is at uzh? where is this info coming from",
  });
  assert.equal(bad.ok, false, "a correction citing an unprovided file must still be rejected");
}

// ── 8. A correct, grounded answer passes clean ───────────────────────────────
// The check must not merely reject everything — an answer that stays inside the
// records has to survive, or the harness is a denial-of-service on itself.
{
  const good = verifyAnswer({
    answer: [
      `Reach out to Elena Weber SINGA Switzerland [F1] — whatsapp +41774730093.`,
      `Why: ${NO_BASIS} No relationship or affiliation is recorded for this contact.`,
      `Habit at risk: ${NO_BASIS}`,
    ].join("\n"),
    facts: FACTS,
    userMessage: USER_MSG,
  });
  assert.equal(
    good.ok,
    true,
    `a fully grounded answer must pass, got: ${JSON.stringify(good.violations, null, 2)}`,
  );
}

// ── 9. Computed answers are stated as settled, and empties survive ───────────
{
  const block = renderDirectives([
    {
      question: "goals stuck at 0% for 30+ days",
      answer: [],
      method: "SQL: progress=0 AND updated_at < now()-30d",
    },
    {
      question: "commitments due in 3 days",
      answer: ["Ship harness — due 2026-08-15"],
      method: "SQL: due <= now()+3d",
    },
  ]);
  assert.match(block, /do not re-derive/i, "computed answers must be marked non-negotiable");
  assert.match(
    block,
    /\(none — the query ran and matched nothing\)/,
    "an empty result must be explicit",
  );
  assert.match(block, /Ship harness/, "a real computed result must render");
}

// ── 10. Assembly order: contract first, records last ─────────────────────────
{
  const ctx = buildGroundedContext({ facts: FACTS, renderedFacts: renderFacts(FACTS) });
  assert.ok(
    ctx.indexOf("Grounding contract") < ctx.indexOf("## Records"),
    "the contract must frame the records, not trail them",
  );
  const repair = buildRepairPrompt(
    verifyAnswer({ answer: "Ilya Druzhnikov (UZH)", facts: FACTS, userMessage: "" }).violations,
    NO_BASIS,
  );
  assert.match(
    repair,
    /Remove every unsupported claim/,
    "repair prompt must instruct deletion, not re-generation",
  );
  assert.ok(
    repair.includes(NO_BASIS),
    "repair prompt must offer the refusal phrase as the substitute",
  );
}

// ── 11. entity-attribution mode: Cat keeps general knowledge, loses invention ──
// Cat answers "how do I get paid in Switzerland" as well as "who owes me money".
// A closed-world check would flag Twint and Lightning as fabrications and make
// Cat useless, so the narrower mode only polices sentences about the user's own
// records. Both halves are asserted, because a check that is too strict gets
// switched off and then protects nothing.
{
  const general = verifyAnswer({
    answer:
      "You can receive Bitcoin over the Lightning Network, or use Twint if your counterparty is in Switzerland. PayPal works internationally.",
    facts: FACTS,
    userMessage: "how can I get paid?",
    mode: "entity-attribution",
  });
  assert.equal(
    general.ok,
    true,
    `general economic knowledge must pass in entity-attribution mode, got: ${JSON.stringify(general.violations)}`,
  );

  const attributed = verifyAnswer({
    answer: "Ask Elena Weber SINGA Switzerland — she is the Program Manager at Impact Hub Zurich.",
    facts: FACTS,
    userMessage: "who can help me with funding?",
    mode: "entity-attribution",
  });
  assert.equal(
    attributed.ok,
    false,
    "an invented affiliation for a known contact must still be caught",
  );
  assert.ok(
    attributed.violations.some((v) => /Impact Hub/i.test(v.text)),
    "the fabricated employer must be named in the violation",
  );

  // The same general sentence IS flagged under closed-world, which is correct
  // for Loki: reporting the operator's fleet has no need to name new companies.
  const strict = verifyAnswer({
    answer: "You can receive Bitcoin over the Lightning Network, or use Twint.",
    facts: FACTS,
    userMessage: "how can I get paid?",
    mode: "closed-world",
  });
  assert.equal(
    strict.ok,
    false,
    "closed-world mode must be strictly stronger than entity-attribution",
  );
}

// ── 12. The fact-free rules block still forbids the invention ────────────────
{
  const rules = buildAssistantRules({ subjectNoun: "contacts and entities" });
  assert.match(rules, /not their employer/i, "the anti-affiliation-inference rule must survive");
  assert.match(rules, /have not browsed the web/i, "the no-research rule must survive");
  assert.match(rules, /General knowledge/, "general knowledge must be explicitly permitted");
  assert.ok(rules.includes(NO_BASIS), "the refusal phrase must be supplied");
  assert.doesNotMatch(
    rules,
    /\[F1\]/,
    "no citation ids exist without a fact set — none must be promised",
  );
}

console.log(
  "✓ agent grounding: 12 adversarial checks passed (UZH, invented bio, invented paths, fake citations, correction path, mode scoping)",
);
