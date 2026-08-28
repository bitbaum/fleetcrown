/**
 * Pins the fleet-refs-audit self-match bug: fleet-refs-audit.yml's own
 * `RETIRED_HANDLES: maonakamoto` declaration made the audit flag itself on
 * its first real run (2026-08-28) — the workflow that exists to catch a
 * retired-owner reference failed on the one line that DEFINES what a retired
 * owner is, not a line that USES one.
 *
 * Also covers USES and verdictFor — the mechanism that actually caught the
 * three real outages this audit exists for (2026-08-26/27/28), and which had
 * zero test coverage until this file: only the newer, less consequential
 * retired-handle check was pinned. A regex bug in USES would silently miss
 * exactly the class of breakage the whole tool was built to catch.
 */
import assert from "node:assert/strict";
import { retiredHandleMatches, USES, verdictFor, pathVerdictFor } from "../ci/fleet-refs-audit-lib.mjs";

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

// --- USES: what actually gets checked against GitHub -----------------------
const usesOf = (text: string) => [...text.matchAll(USES)].map(([, owner, name]) => `${owner}/${name}`);

assert.deepEqual(
  usesOf("jobs:\n  x:\n    uses: bitbaum/fleetcrown@main\n"),
  ["bitbaum/fleetcrown"],
  "a plain owner/repo@ref uses: line is matched"
);

assert.deepEqual(
  usesOf("jobs:\n  x:\n    uses: bitbaum/fleetcrown/.github/workflows/selfhost-deploy.yml@main\n"),
  ["bitbaum/fleetcrown"],
  "the owner/repo is extracted even with a path and filename after it"
);

assert.deepEqual(
  usesOf("jobs:\n  x:\n    uses: ./.github/actions/local-thing\n"),
  [],
  "a local action (no owner, no @ref) is not matched"
);

assert.deepEqual(
  usesOf("jobs:\n  x:\n    uses: docker://ghcr.io/owner/image:tag\n"),
  [],
  "a docker:// reference has no owner/repo to be wrong about and must not match"
);

assert.deepEqual(
  usesOf("jobs:\n  a:\n    uses: bitbaum/one@v1\n  b:\n    uses: bitbaum/two@v2\n"),
  ["bitbaum/one", "bitbaum/two"],
  "every uses: line in a file is matched independently"
);

assert.deepEqual(
  usesOf("      uses: bitbaum/fleetcrown@main\n"),
  ["bitbaum/fleetcrown"],
  "indentation before uses: does not prevent a match"
);

// --- verdictFor: the actual redirect-detection decision --------------------
assert.deepEqual(
  verdictFor("bitbaum/fleetcrown", "bitbaum/fleetcrown"),
  { kind: "ok" },
  "a reference already naming its canonical owner is fine"
);

assert.deepEqual(
  verdictFor("catomean/fleetcrown", "bitbaum/fleetcrown"),
  { kind: "stale", message: "uses catomean/fleetcrown — canonical is bitbaum/fleetcrown (Actions will NOT follow this)" },
  "REST resolving a DIFFERENT canonical name is the exact redirect gap Actions falls into"
);

assert.deepEqual(
  verdictFor("catomean/does-not-exist", null),
  { kind: "stale", message: "uses catomean/does-not-exist — DOES NOT EXIST" },
  "a 404 from REST is reported as stale, not silently skipped"
);

assert.deepEqual(
  verdictFor("bitbaum/fleetcrown", undefined),
  { kind: "unreadable", message: "bitbaum/fleetcrown (lookup failed)" },
  "a failed lookup (rate limit, 5xx) must be unreadable — never reported as clean, never as a false stale"
);


// --- USES now also yields the subpath and ref, so the FILE can be checked ---
const partsOf = (text: string) =>
  [...text.matchAll(USES)].map(([, owner, name, subpath, ref]) => ({ slug: `${owner}/${name}`, subpath, ref }));

assert.deepEqual(
  partsOf("jobs:\n  x:\n    uses: bitbaum/fleet/.github/workflows/auto-merge-sweep.yml@main\n"),
  [{ slug: "bitbaum/fleet", subpath: "/.github/workflows/auto-merge-sweep.yml", ref: "main" }],
  "a reusable-workflow reference yields owner/repo, the path, and the ref"
);

assert.deepEqual(
  partsOf("jobs:\n  x:\n    uses: actions/checkout@v5\n"),
  [{ slug: "actions/checkout", subpath: "", ref: "v5" }],
  "a plain action has no subpath — there is no file to check beyond the repo"
);

assert.deepEqual(
  partsOf("jobs:\n  x:\n    uses: bitbaum/fleet/.github/workflows/x.yml@abc1234\n")[0].ref,
  "abc1234",
  "a pinned sha is captured as the ref, not the branch name"
);

// --- pathVerdictFor: the repo can be canonical while the file is gone -------
// This is the dotfiles shim case. Sixteen repos called
// bitbaum/dotfiles/.github/workflows/auto-merge-sweep.yml; the shim was deleted
// once they migrated to bitbaum/fleet. `bitbaum/dotfiles` is and remains the
// canonical name, so the owner check passes and sees nothing wrong.
assert.deepEqual(
  pathVerdictFor("bitbaum/dotfiles", "/.github/workflows/auto-merge-sweep.yml", "master", false),
  {
    kind: "stale",
    message: "uses bitbaum/dotfiles/.github/workflows/auto-merge-sweep.yml@master — the repo exists but THAT FILE DOES NOT (moved or deleted)",
  },
  "a deleted reusable workflow in a repo that still exists must be caught"
);

assert.deepEqual(
  pathVerdictFor("bitbaum/fleet", "/.github/workflows/auto-merge-sweep.yml", "main", true),
  { kind: "ok" },
  "a file that is still there is fine"
);

assert.deepEqual(
  pathVerdictFor("actions/checkout", "", "v5", true),
  { kind: "ok" },
  "no subpath means there is no file to check — never a finding"
);

assert.deepEqual(
  pathVerdictFor("bitbaum/fleet", "/.github/workflows/x.yml", "main", undefined),
  { kind: "unreadable", message: "bitbaum/fleet/.github/workflows/x.yml@main (path lookup failed)" },
  "a failed path lookup is unreadable — never clean, and never a false stale"
);

console.log("OK: 22 assertions passed");
