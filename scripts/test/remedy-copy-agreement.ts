// Copy that points at a button must name the button that is actually drawn.
//
// /control once rendered Retry beside every failure. For "no running agent"
// that button was a lie — the target is identically absent on every attempt —
// so it was replaced with "Start session", and failure-remedy.ts records why.
//
// The BUTTON was fixed. Two sentences describing it were not: the terminal's
// empty state and the install confirmation both kept telling the reader
// "Attention shows Retry" for the never-started case, which is precisely the
// case where Attention deliberately shows Start session. The reader was sent
// to hunt for a control that is not drawn.
//
// So this asserts the two halves agree, and greps the source for prose that
// names a remedy button, so a future sentence cannot reintroduce the drift.
// Run: npx tsx scripts/test/remedy-copy-agreement.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FAILURE_PHRASE,
  FAILURE_REMEDY,
  REMEDY_LABEL,
  remedyForFailure,
  remedyLabelFor,
} from "@/lib/failure-remedy";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}
const eq = (got: string, want: string, label: string) =>
  ok(got === want, `${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the mapping itself ──────────────────────────────────────────────────────
const noAgent = `dispatch failed: ${FAILURE_PHRASE.NO_RUNNING_AGENT} some-tab`;
eq(remedyForFailure(noAgent), FAILURE_REMEDY.START_SESSION, "no-running-agent asks for a session");
eq(remedyLabelFor(noAgent), "Start session", "and its button says Start session");
eq(remedyForFailure("connection reset"), FAILURE_REMEDY.RETRY, "a transient failure is retryable");
eq(remedyLabelFor("connection reset"), "Retry", "and its button says Retry");
eq(remedyLabelFor(null), "Retry", "an unknown failure falls back to Retry rather than nothing");

// Every remedy has a label — a new remedy without one would render empty.
for (const remedy of Object.values(FAILURE_REMEDY)) {
  ok(Boolean(REMEDY_LABEL[remedy]?.trim()), `remedy "${remedy}" has a button label`);
}

// ── the prose ───────────────────────────────────────────────────────────────
// The never-started case is the no-running-agent case. Any sentence about it
// that names the OTHER button is the bug this file exists for.
const SRC = join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const [i, line] of text.split("\n").entries()) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    // Prose that tells the reader Attention will show a literal "Retry" for a
    // never-started / no-session situation.
    const mentionsAttention = /Attention\s+(shows|offers)/i.test(line);
    const namesRetryLiterally = /["'“”`][^"'“”`]*\bRetry\b/.test(line);
    const aboutNeverStarted = /never started|no live agent|no running agent|no session/i.test(line);
    if (mentionsAttention && namesRetryLiterally && aboutNeverStarted) {
      offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}`);
    }
  }
}
ok(
  offenders.length === 0,
  `no copy promises Retry for the never-started case — found: ${offenders.join(", ")}`,
);

// The guard must be able to fail: prove the detector fires on the real string
// that shipped, rather than being a regex that matches nothing.
{
  const shipped = "open Control — Attention shows Retry when the prompt never started.";
  const mentionsAttention = /Attention\s+(shows|offers)/i.test(shipped);
  const namesRetryLiterally = /["'“”`][^"'“”`]*\bRetry\b/.test(`"${shipped}"`);
  const aboutNeverStarted = /never started|no live agent|no running agent|no session/i.test(
    shipped,
  );
  ok(
    mentionsAttention && namesRetryLiterally && aboutNeverStarted,
    "the detector recognises the exact sentence that shipped (it is not inert)",
  );
  // ...and stays quiet on the corrected sentence.
  const fixed = `open Control — Attention offers “${REMEDY_LABEL[FAILURE_REMEDY.START_SESSION]}” when the prompt never started.`;
  ok(
    !/["'“”`][^"'“”`]*\bRetry\b/.test(`"${fixed}"`),
    "the detector stays quiet on the corrected sentence",
  );
}

console.log(`remedy-copy-agreement: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
