/**
 * A reply that ran out of tokens still contains the proposals that finished.
 * Run: npx tsx scripts/test/frontier-salvage.ts
 *
 * The class this closes: an all-or-nothing parser in front of a model whose
 * output length nobody controls. `extractJson` needs a balanced top-level
 * object, so ONE proposal cut in half discarded the two before it that were
 * perfectly well-formed — and the run reported `unparseable`, which reads as
 * "the model said something unreadable" rather than "the model said more than
 * we let it".
 *
 * Observed in prod 2026-08-27 at maxTokens 3000, on a reply that opened
 * correctly and stopped mid-word inside the first rationale. Raising the budget
 * helps but cannot be a guarantee: the model decides how long a rationale is,
 * so a large enough answer will always be able to run off the end. Salvage is
 * what makes that a partial result instead of a lost night.
 */
import assert from "node:assert/strict";
import { salvageProposals } from "../../src/lib/frontier/propose";

// ── The real shape: two complete proposals, a third cut mid-string ───────────
{
  const truncated =
    '{"proposals":[' +
    '{"title":"A","rationale":"first","sourceUrls":["https://x/1"]},' +
    '{"title":"B","rationale":"second","sourceUrls":["https://x/2"]},' +
    '{"title":"C","rationale":"third but the reply stops he';
  const out = salvageProposals(truncated);
  assert.ok(out, "an array was present — this is salvageable, not unreadable");
  assert.equal(out!.length, 2, "both COMPLETE proposals must survive the half-written one");
  assert.equal((out![0] as { title: string }).title, "A");
  assert.equal((out![1] as { title: string }).title, "B");
}

// ── Braces inside a rationale must not unbalance the objects after it ────────
// The brace here is deliberately UNPAIRED. A balanced "{…}" inside a string
// proves nothing: the depth counter returns to the right value on its own, so
// the test passes even with string handling removed. (Learned by mutation —
// the first version of this case did exactly that.)
{
  const withBraces =
    '{"proposals":[' +
    '{"title":"A","rationale":"the JSON starts with a { and never closes it here","sourceUrls":[]},' +
    '{"title":"B","rationale":"plain","sourceUrls":[]}]}';
  const out = salvageProposals(withBraces);
  assert.equal(out!.length, 2, "an unpaired brace inside a string is text, not structure");
  assert.equal(
    (out![1] as { title: string }).title,
    "B",
    "the object after the brace must still parse",
  );
}

// ── An escaped quote must not be read as the end of the string ──────────────
{
  const escaped =
    '{"proposals":[' +
    '{"title":"A","rationale":"they said \\"ship it\\" and left a { behind","sourceUrls":[]},' +
    '{"title":"B","rationale":"plain","sourceUrls":[]}]}';
  const out = salvageProposals(escaped);
  assert.equal(out!.length, 2, 'an escaped \\" stays inside the string');
  assert.equal((out![1] as { title: string }).title, "B");
}

// ── Nested objects inside one proposal stay part of that proposal ────────────
{
  const nested = '{"proposals":[{"title":"A","meta":{"deep":{"deeper":1}},"rationale":"r"}]}';
  const out = salvageProposals(nested);
  assert.equal(out!.length, 1, "nesting must not split one proposal into several");
}

// ── No JSON at all is a DIFFERENT failure and must stay distinguishable ──────
// This is the case that needs a prompt or model fix rather than more tokens,
// so collapsing the two would put the next investigation back where it started.
for (const prose of [
  "We need to propose up to 3 gap-anchored matches. Must name a specific open gap.",
  "I'm sorry, I can't help with that.",
  "",
]) {
  assert.equal(
    salvageProposals(prose),
    null,
    `no proposals array in ${JSON.stringify(prose.slice(0, 30))} — must report unreadable, not empty`,
  );
}

// ── An array that opened and immediately stopped yields nothing, not null ────
// "the model started answering and was cut off" is truncation even when zero
// objects survive; "there was never an array" is not.
{
  const out = salvageProposals('{"proposals":[{"title":"only half');
  assert.deepEqual(out, [], "an opened-but-empty salvage is truncation, not unreadability");
}

// ── A well-formed reply is unaffected ────────────────────────────────────────
{
  const whole = '{"proposals":[{"title":"A","rationale":"r","sourceUrls":[]}]}';
  assert.equal(salvageProposals(whole)!.length, 1);
}

// ── A <think> preamble is stripped before the walk, as elsewhere ─────────────
{
  const withThink =
    '<think>weighing options</think>\n{"proposals":[{"title":"A","rationale":"r"}]}';
  assert.equal(
    salvageProposals(withThink)!.length,
    1,
    "reasoning preamble must not hide the array",
  );
}

console.log(
  "✓ frontier salvage: complete proposals survive a truncated reply; no-JSON stays a separate failure",
);
