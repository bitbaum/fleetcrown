/**
 * Pins the fleet-refs-audit self-match bug: fleet-refs-audit.yml's own
 * `RETIRED_HANDLES: maonakamoto` declaration made the audit flag itself on
 * its first real run (2026-08-28) — the workflow that exists to catch a
 * retired-owner reference failed on the one line that DEFINES what a retired
 * owner is, not a line that USES one.
 */
import assert from "node:assert/strict";
import { retiredHandleMatches } from "../ci/fleet-refs-audit-lib.mjs";

const RETIRED = ["maonakamoto"];

// --- the exact production false positive ---------------------------------
const selfDeclaration = `
on:
  workflow_dispatch: {}
jobs:
  audit:
    steps:
      - env:
          RETIRED_HANDLES: maonakamoto
        run: node scripts/ci/fleet-refs-audit.mjs
`;
assert.deepEqual(
  retiredHandleMatches(selfDeclaration, RETIRED),
  [],
  "the RETIRED_HANDLES declaration line must not flag itself"
);

// --- a genuine live reference must still be caught ------------------------
const staleUse = `
jobs:
  x:
    uses: maonakamoto/dotfiles/.github/workflows/thing.yml@master
`;
assert.deepEqual(
  retiredHandleMatches(staleUse, RETIRED),
  ["maonakamoto"],
  "a real uses: line naming the retired owner must still fail"
);

// --- documentation in a comment is intentional, not a bug -----------------
const documented = `
# 2026-08-26 the account maonakamoto was renamed to catomean
name: CI
`;
assert.deepEqual(
  retiredHandleMatches(documented, RETIRED),
  [],
  "a comment explaining the outage must not be flagged"
);

// --- RETIRED_HANDLES stripping must not eat an unrelated live reference on
//     a DIFFERENT line in the same file --------------------------------
const both = `
env:
  RETIRED_HANDLES: maonakamoto
jobs:
  x:
    uses: maonakamoto/other-repo@main
`;
assert.deepEqual(
  retiredHandleMatches(both, RETIRED),
  ["maonakamoto"],
  "stripping the declaration line must not hide a genuine reference elsewhere in the same file"
);

// --- a clean file reports nothing ------------------------------------------
assert.deepEqual(
  retiredHandleMatches("name: CI\non: push\njobs:\n  x:\n    uses: bitbaum/fleetcrown/.github/workflows/selfhost-deploy.yml@main\n", RETIRED),
  [],
  "a file with no retired handle anywhere must report nothing"
);

console.log("OK: 5 assertions passed");
