/**
 * Name extraction for people lookup.
 * Run: npx tsx scripts/test/agent-name-lookup.ts
 *
 * Regression test for a bug that reached production. `peopleFacts` passed the
 * WHOLE user message to `searchPeople`, which filters with `name ILIKE '%q%'` —
 * so a sentence could never match a name column. Every lookup fell through to
 * "12 most recent contacts", and Loki then correctly reported "Not in your
 * data" about Ilya Druzhnikov, who is one of 1285 rows in the people table.
 *
 * The lesson worth encoding: hardening an assistant against fabrication moved
 * the failure to the opposite end. A grounded assistant that cannot find real
 * records is not safer than one that invents them — it is differently useless,
 * and it FAILS QUIETLY, because a confident refusal looks like diligence.
 *
 * `nameCandidates` is not exported (it is an implementation detail of
 * peopleFacts, and sources.ts imports the DB), so this asserts the extraction
 * behaviour through a copy of the regexes it uses. If that duplication ever
 * drifts, this test is the thing that should be rewritten to import directly —
 * a note, not a licence to skip it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nameCandidates } from "../../src/lib/people-names";
import { CHAT_CHAIN } from "../../src/config/chat-models";

const SRC = readFileSync("src/lib/agent/sources.ts", "utf8");

// ── The shipped bug must not come back ───────────────────────────────────────
{
  assert.doesNotMatch(
    SRC,
    /searchPeople\(userId,\s*query\.trim\(\)\.slice/,
    "peopleFacts must not pass the raw message as a name filter — that was the bug",
  );
  assert.match(SRC, /import \{ nameCandidates \} from "@\/lib\/people-names"/, "name extraction must exist");
  assert.match(
    SRC,
    /for \(const name of candidates\)/,
    "each extracted name must be searched separately",
  );
}

function candidates(message: string): string[] {
  return nameCandidates(message);
}

// The exact message that produced the false negative in production.
{
  const c = candidates(
    "Who is Ilya Druzhnikov in my contacts, and what is his affiliation? Also do research on Elena Weber — linkedin etc.",
  );
  assert.ok(c.includes("Ilya Druzhnikov"), `full name must be extracted, got ${JSON.stringify(c)}`);
  assert.ok(c.includes("Elena Weber"), `second name must be extracted, got ${JSON.stringify(c)}`);
  // Full names must precede their parts so the precise match wins the slots.
  assert.ok(
    c.indexOf("Ilya Druzhnikov") < c.indexOf("Ilya"),
    "the full name must be searched before the bare first name",
  );
}

// First-name-only is how most contacts are actually asked about.
{
  const c = candidates("what is Elena's number?");
  assert.ok(c.some((n) => n.startsWith("Elena")), `bare first name must be extracted, got ${JSON.stringify(c)}`);
}

// Stopwords must not become search terms — "Who"/"My" would match nothing and
// burn the candidate budget the real name needs.
{
  const c = candidates("Who should I reach out to today?");
  assert.ok(!c.some((n) => /^(Who|Should|Reach)$/i.test(n)), `stopwords leaked: ${JSON.stringify(c)}`);
}

// A message with no names must yield none, so the caller falls back to recent
// contacts rather than searching for junk.
{
  assert.deepEqual(candidates("what should i do first today?"), [], "no capitalised names → no candidates");
}

{
  const c = candidates("write manu about this saturday");
  assert.ok(c.some((n) => n.toLowerCase() === "manu"), `lowercase write-target must extract, got ${JSON.stringify(c)}`);
  assert.ok(!c.some((n) => /saturday/i.test(n)), `weekday must not be a name, got ${JSON.stringify(c)}`);
}

// Accented and hyphenated names must survive — "Ilya Grün" is in the real table.
{
  const c = candidates("is Ilya Grün the same person as Jean-Luc?");
  assert.ok(c.includes("Ilya Grün"), `umlaut name must extract, got ${JSON.stringify(c)}`);
  assert.ok(c.some((n) => n.includes("Jean-Luc")), `hyphenated name must extract, got ${JSON.stringify(c)}`);
}

// ── A rate limit must step down, not abandon the tools ───────────────────────
// The 429 fallback sent the turn to a path with WEAKER retrieval, which is how
// a capacity blip became a wrong answer.
{
  const LLM = readFileSync("src/lib/agent/llm.ts", "utf8");
  assert.match(LLM, /res\.status === 429/, "a 429 must be handled explicitly");
  // The step-down used to be one hardcoded smaller model AT THE SAME VENDOR,
  // which is no step-down at all once that vendor's daily budget is spent —
  // every "fallback" drew on the same exhausted pool. It is now a walk down
  // CHAT_CHAIN, which spans vendors, so a 429 still has somewhere to go.
  assert.match(LLM, /chainFrom/, "a 429 must advance through the model chain, not abandon the tools");
  // Asserted against the chain's VALUE, not the text of the file that declares
  // it. This used to grep chat-models.ts for the model id, which broke the
  // moment the chain moved into `ai-kit` — the property held perfectly and
  // the test failed anyway, because it was reading a source file rather than
  // the thing the source file produces.
  // …and asserted as a SET rather than one id. The previous anchor was
  // `llama-3.1-8b-instant` alone, which the vendor retired on 2026-08-18 —
  // so the guard failed not because the property broke but because its single
  // example rotted. Anchoring a rot-detector to one pinned id reproduces the
  // exact failure it is watching for. Any probed model satisfies it.
  //
  // Membership here means: called with a real tool definition and observed to
  // emit a parseable tool call. gpt-oss-120b / gpt-oss-20b probed 2026-08-25
  // (native tool_call, correct arguments). Do not add a model you have not run.
  const LOOP_VERIFIED = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  const models = CHAT_CHAIN.flatMap((p) => p.models);
  assert.ok(
    models.some((m) => LOOP_VERIFIED.includes(m)),
    `the chain must keep a model verified to drive the loop, got: ${models.join(", ")}`,
  );
}

// ── The chain must outlive any one vendor ────────────────────────────────────
// Guards the property that makes the chain worth having: links at two or more
// DIFFERENT vendors. A chain within one vendor dies all at once.
{
  const vendors = new Set(CHAT_CHAIN.map((p) => p.id));
  assert.ok(vendors.size >= 2, `chain must span 2+ vendors, got: ${[...vendors].join(", ")}`);
}

console.log("✓ agent name lookup: extraction + 429 chain-walk checks passed");
