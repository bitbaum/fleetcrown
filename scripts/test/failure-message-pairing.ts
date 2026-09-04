// Every failure the desktop runner can throw must classify to a real remedy.
//
// This gate exists because the same bug shipped twice, three lines apart.
//
// `desktop/src/main/poller.ts` composes its own error strings. `remedyForFailure`
// matches on literal phrases. They are two definitions of the same sentence in
// two independently-released codebases, so they drift — and the drift is
// SILENT, because an unclassified failure still renders a plausible Retry
// button. A visitor reported one of them from /control as "what is this? can
// you fix?". Sweeping for the class immediately found its neighbour.
//
// Counting instances was never going to work. This pairs the producer with the
// matcher: read the literals poller.ts actually throws, and assert each one
// classifies to something other than the default. Reword either side and this
// fails before anyone sees a button that cannot work.
//
// Run: npx tsx scripts/test/failure-message-pairing.ts
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  remedyForFailure,
  FAILURE_REMEDY,
  FOCUS_FAILURE_PHRASE,
} from "../../src/lib/terminals/focus-failure";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const POLLER = join(ROOT, "desktop/src/main/poller.ts");

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

const src = readFileSync(POLLER, "utf8");

/**
 * Literals thrown as focus/inject failures. Template placeholders are filled
 * with a plausible value, because `tab not found: ${tab}` reaches the
 * classifier as `tab not found: fleetcrown`.
 */
// Backtick templates may contain inner quotes — `zellij tab "${tab}" did not
// gain focus`. An earlier version of this regex stopped at that quote and
// silently tested a truncated string, which is its own version of the bug this
// file exists to prevent.
const thrown = [...src.matchAll(/throw new Error\(\s*`([^`]{6,120})`/g)]
  .map((m) => m[1].replace(/\$\{[^}]+\}/g, "fleetcrown").trim())
  .concat([...src.matchAll(/throw new Error\(\s*'([^']{6,120})'/g)].map((m) => m[1].trim()))
  .filter((s) => /zellij|tab |session|terminal|focus/i.test(s));

ok(thrown.length >= 3, `found focus-related throws in poller.ts (got ${thrown.length})`);

// The real invariant is RECOGNITION, not "never RETRY".
//
// Retry is the correct remedy for a focus race, so a rule of "nothing may
// classify as RETRY" would be wrong. What must never happen is a message
// reaching the default because nobody TAUGHT the classifier about it — an
// accidental right answer is indistinguishable from a wrong one until the
// default changes, and then it becomes a bug nobody edited.
const PHRASES = Object.values(FOCUS_FAILURE_PHRASE);
for (const msg of thrown) {
  const lower = msg.toLowerCase();
  const matched = PHRASES.find((p) => lower.includes(p));
  ok(
    Boolean(matched),
    `poller.ts throws "${msg}" — no FOCUS_FAILURE_PHRASE matches it, so its remedy (${remedyForFailure(msg)}) is an accident`,
  );
}

// Real failures arrive wrapped: "focus_tab → <tab> failed: <message>", which is
// what actually reaches the UI.
for (const msg of thrown) {
  const wrapped = `focus_tab → fleetcrown failed: ${msg}`.toLowerCase();
  ok(
    PHRASES.some((p) => wrapped.includes(p)),
    `wrapped form of "${msg}" is still recognised`,
  );
}

// The two that must NOT be retryable, stated explicitly — this is the original
// bug and the sweep's finding, pinned by behaviour rather than by phrase.
ok(
  remedyForFailure("tab not found: fleetcrown") === FAILURE_REMEDY.START_SESSION,
  "a missing tab offers Start session, never Retry",
);
ok(
  remedyForFailure("no zellij session found") === FAILURE_REMEDY.START_TERMINAL,
  "no zellij at all offers Open Terminal, never Retry",
);
// And the one that legitimately IS retryable, so the rule above cannot be
// over-applied into hiding Retry from a genuinely transient failure.
ok(
  remedyForFailure('zellij tab "fleetcrown" did not gain focus') === FAILURE_REMEDY.RETRY,
  "a focus race stays retryable — repeating it can genuinely succeed",
);

/**
 * Every remedy the classifier can return must be RENDERABLE.
 *
 * START_TERMINAL had zero consumers in the UI: a correctly-classified "no
 * zellij at all" produced no button at all, which is worse than the wrong
 * button it replaced — the row offered nothing but Dismiss. A remedy nothing
 * renders is a classification that silently does nothing.
 */
const bar = readFileSync(join(ROOT, "src/components/control/AttentionBar.tsx"), "utf8");
for (const remedy of Object.values(FAILURE_REMEDY)) {
  const constName = Object.keys(FAILURE_REMEDY).find(
    (k) => FAILURE_REMEDY[k as keyof typeof FAILURE_REMEDY] === remedy,
  );
  ok(
    bar.includes(`FAILURE_REMEDY.${constName}`),
    `AttentionBar renders something for FAILURE_REMEDY.${constName}`,
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
