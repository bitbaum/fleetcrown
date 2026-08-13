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

const SRC = readFileSync("src/lib/agent/sources.ts", "utf8");

// ── The shipped bug must not come back ───────────────────────────────────────
{
  assert.doesNotMatch(
    SRC,
    /searchPeople\(userId,\s*query\.trim\(\)\.slice/,
    "peopleFacts must not pass the raw message as a name filter — that was the bug",
  );
  assert.match(SRC, /function nameCandidates/, "name extraction must exist");
  assert.match(
    SRC,
    /for \(const name of candidates\)/,
    "each extracted name must be searched separately",
  );
}

// ── Extraction behaviour, mirroring nameCandidates ───────────────────────────
function candidates(message: string): string[] {
  const stop = new Set([
    "who", "what", "when", "where", "why", "how", "the", "and", "but", "for", "with",
    "my", "me", "i", "is", "are", "was", "in", "on", "at", "to", "of", "do", "does",
    "also", "please", "can", "you", "your", "contacts", "contact", "affiliation",
    "research", "linkedin", "etc", "about", "tell", "give", "find", "show", "reach",
    "out", "him", "her", "them", "his", "their", "a", "an", "it",
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sentence of message.split(/(?<=[.!?])\s+/)) {
    // Tokenise EVERY word, not just capitalised ones. Matching only capitals
    // makes the lowercase words between two names invisible, so "Ilya Grün the
    // same person as Jean-Luc" merges into one nonsense run that matches
    // nothing and eats a candidate slot.
    const tokens = sentence.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    let run: string[] = [];
    const flush = () => {
      if (run.length > 0) {
        for (const cand of [run.join(" "), ...(run.length > 1 ? run : [])]) {
          const key = cand.toLowerCase();
          if (cand.length > 2 && !seen.has(key)) {
            seen.add(key);
            out.push(cand);
          }
        }
      }
      run = [];
    };
    for (const tok of tokens) {
      const isName = /^\p{Lu}/u.test(tok) && !stop.has(tok.toLowerCase());
      if (isName) run.push(tok);
      else flush();
    }
    flush();
  }
  return out.slice(0, 6);
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
  assert.match(LLM, /SMALL_MODEL/, "a 429 must step down to the small model");
  assert.match(LLM, /llama-3\.1-8b-instant/, "the step-down target must be a model verified to drive the loop");
}

console.log("✓ agent name lookup: extraction + 429 step-down checks passed");
