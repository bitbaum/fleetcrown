// Every failure the desktop runner can throw about a missing agent must classify
// to a real remedy.
//
// `desktop/src/main/poller.ts` composes its own error strings. `remedyForFailure`
// matches on literal phrases. They are two definitions of the same sentence in
// two independently-released codebases, so they drift — and the drift is
// SILENT, because an unclassified failure still renders a plausible Retry
// button. This pairs the producer with the matcher: read the literals poller.ts
// actually throws, and assert each one that talks about an agent/terminal is
// recognised. Reword either side and this fails before anyone sees a button
// that cannot work.
//
// Run: npx tsx scripts/test/failure-message-pairing.ts
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { remedyForFailure, FAILURE_REMEDY, FAILURE_PHRASE } from "../../src/lib/failure-remedy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const POLLER = join(ROOT, "desktop/src/main/poller.ts");

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

const src = readFileSync(POLLER, "utf8");
const thrown = [...src.matchAll(/throw new Error\(\s*`([^`]{6,160})`/g)]
  .map((m) => m[1].replace(/\$\{[^}]+\}/g, "fleetcrown").trim())
  .concat([...src.matchAll(/throw new Error\(\s*'([^']{6,160})'/g)].map((m) => m[1].trim()))
  .filter((s) => /running agent|terminal|focus|session/i.test(s));

ok(thrown.length >= 1, `found agent/terminal throws in poller.ts (got ${thrown.length})`);

// The invariant is RECOGNITION: a message must reach a remedy because the
// classifier was taught it, never by accident of the default.
const PHRASES = Object.values(FAILURE_PHRASE);
for (const message of thrown) {
  const recognised = PHRASES.some((p) => message.toLowerCase().includes(p));
  ok(recognised, `poller throw is recognised by a FAILURE_PHRASE: ${JSON.stringify(message)}`);
  if (recognised) {
    ok(
      remedyForFailure(message) !== FAILURE_REMEDY.RETRY,
      `recognised message does not fall to RETRY: ${JSON.stringify(message)}`,
    );
  }
}

console.log(`failure-message-pairing: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
