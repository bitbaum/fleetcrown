/**
 * One elapsed-time ladder, two renderings. These pin all three bugs that came
 * from having had three ladders:
 *
 *   1. "Next (agent, 288h ago)" — timeAgo stopped scaling at hours, so a
 *      twelve-day-old handoff came out as a large meaningless number on a card
 *      whose whole claim is telling you how current its "Next" is.
 *   2. "now ago" — `${shortTimeAgo(t)} ago` at call sites that appended the
 *      word by hand, during the first minute after a check, i.e. exactly when
 *      someone is looking.
 *   3. A silent disagreement about when weeks begin.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { timeAgo, shortTimeAgo, elapsedSince } from "../../src/lib/dates";

const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;
const ago = (delta: number) => timeAgo(Date.now() - delta);
const short = (delta: number) => shortTimeAgo(Date.now() - delta);

// --- the ladder --------------------------------------------------------
assert.deepEqual(elapsedSince(Date.now()), { value: 0, unit: "now" });
assert.deepEqual(elapsedSince(Date.now() - 5 * MIN), { value: 5, unit: "m" });
assert.deepEqual(elapsedSince(Date.now() - 288 * HOUR), { value: 12, unit: "d" });

// Floors, never rounds: a label must not claim more time has passed than has.
assert.equal(ago(59 * SEC), "just now", "59s is not a minute yet");
assert.equal(ago(90 * SEC), "1m ago", "90s is one minute, not two");
assert.equal(ago(119 * MIN), "1h ago", "119m is one hour, not two");

// Clock skew between the box and the browser must not produce a negative age.
assert.equal(ago(-10 * SEC), "just now", "a future timestamp clamps to just now");
assert.equal(short(-10 * SEC), "now");

// --- timeAgo: the only place the word "ago" is appended -----------------
assert.equal(ago(0), "just now", "under a minute reads as English, never 'now ago'");
assert.equal(ago(5 * MIN), "5m ago");
assert.equal(ago(3 * HOUR), "3h ago");
assert.equal(ago(23 * HOUR), "23h ago");
assert.equal(ago(2 * DAY), "2d ago");
assert.equal(ago(288 * HOUR), "12d ago", "THE regression: 288h is a fortnight");

// Days run to 30 before months: for a stale handoff "21d ago" is the
// actionable reading and "3w ago" throws away the precision that makes it so.
assert.equal(ago(21 * DAY), "21d ago");
assert.equal(ago(30 * DAY), "30d ago");
assert.equal(ago(31 * DAY), "1mo ago");
assert.equal(ago(200 * DAY), "6mo ago");
assert.equal(ago(400 * DAY), "1y ago");

// --- shortTimeAgo: same ladder, bare token ------------------------------
assert.equal(short(0), "now");
assert.equal(short(5 * MIN), "5m");
assert.equal(short(288 * HOUR), "12d");
assert.equal(short(31 * DAY), "1mo");

// The two renderers cannot drift, because they read one ladder.
for (const delta of [0, 30 * SEC, 5 * MIN, 3 * HOUR, 2 * DAY, 288 * HOUR, 31 * DAY, 400 * DAY]) {
  const s = short(delta), t = ago(delta);
  assert.equal(
    t,
    s === "now" ? "just now" : `${s} ago`,
    `timeAgo and shortTimeAgo disagree at ${delta}ms`,
  );
}

// No age may ever render as a raw hour count again.
for (const days of [1, 2, 7, 12, 21, 29, 30, 45, 200, 900]) {
  const out = ago(days * DAY);
  assert.ok(/^\d+(d|mo|y) ago$/.test(out), `${days}d rendered as "${out}"`);
}

// --- the class, closed --------------------------------------------------
// Bug 2 was reintroduced three times by three different call sites appending
// the word themselves. A comment asking people not to did not stop it, so this
// is a gate: shortTimeAgo returns a bare token and "ago" belongs to timeAgo.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}
const DEFINITION = join("src", "lib", "dates.ts"); // quotes the bug in its own doc comment

// Per LINE, and deliberately not one clever regex over the whole call: the
// first version of this gate used `shortTimeAgo\([^)]*\)\s*ago` and silently
// passed, because [^)] cannot cross the parens in
// `shortTimeAgo(new Date(x).getTime())} ago`. It was a green check that proved
// nothing. Any line that both calls shortTimeAgo and says "ago" after it is
// the bug, whatever the argument looks like. Comment lines are skipped so
// prose about the bug is not itself an offence.
function offendingLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
      const call = line.indexOf("shortTimeAgo(");
      return call !== -1 && /\bago\b/.test(line.slice(call));
    })
    .map((line) => line.trim());
}

const offenders = sourceFiles(join(import.meta.dirname, "..", "..", "src"))
  .filter((f) => !f.endsWith(DEFINITION))
  .flatMap((f) => offendingLines(f).map((line) => `${f}: ${line}`));

assert.deepEqual(
  offenders,
  [],
  `these append "ago" to shortTimeAgo — use timeAgo instead:\n${offenders.join("\n")}`,
);

console.log("✓ time-ago tests passed");
