// Loki may describe what OrangeCat can do. It may never claim to do it.
//
// When OrangeCat shipped its Studio, Loki started being told about a system
// that renders video, music and prose. That is the right fix for an operator
// asking "can I make a trailer for this?" and being told no — and it is also
// exactly the shape of the mistake LOKI_CAPABILITIES exists to prevent, which
// began as Loki inventing a "security sandbox" and an Approve button that
// would book a calendar event. A capability preface that gains neighbouring
// abilities without gaining the boundary alongside them is how an assistant
// starts promising renders it cannot produce.
//
// So this pins both halves: the facts come from the ecosystem SSOT (never
// retyped into prose), and the disclaimer travels with them.
// Run: npx tsx scripts/test/loki-neighbour-boundary.ts
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ORANGECAT_CAPABILITIES } from "../../src/config/ecosystem";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

const loki = readFileSync(join(ROOT, "src/lib/loki-core.ts"), "utf8");

ok(
  ORANGECAT_CAPABILITIES.lines.length > 0,
  "the ecosystem SSOT actually states what OrangeCat can do",
);
ok(
  /^https:\/\//.test(ORANGECAT_CAPABILITIES.studioUrl),
  "the Studio URL an operator gets sent to is absolute",
);

// The preface must READ the SSOT rather than restate it. A copy here would
// drift the moment OrangeCat's Studio changes, and drift in a grounding
// contract is how an assistant ends up confidently wrong.
ok(
  /ORANGECAT_CAPABILITIES\.lines/.test(loki),
  "the capability preface derives the neighbour's abilities from the SSOT",
);
for (const line of ORANGECAT_CAPABILITIES.lines) {
  ok(
    !loki.includes(line),
    "no SSOT line is copied verbatim into loki-core (it is interpolated, not duplicated)",
  );
}

// The boundary. Every one of these is a sentence Loki must be carrying, and
// losing any of them turns a description into a promise.
ok(
  /These are ITS capabilities, not yours/.test(loki),
  "the preface names whose capabilities those are",
);
ok(
  /You cannot render, compose or publish any of it yourself/.test(loki),
  "the preface denies Loki the neighbour's abilities in the same breath",
);
ok(
  /ORANGECAT_CAPABILITIES\.studioUrl/.test(loki),
  "Loki sends the operator somewhere real instead of describing a place",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
