// The `verify` gate has ONE definition: package.json "scripts.verify".
//
// Three docs (AGENTS.md, README.md, CONTRIBUTING.md) had each grown their own
// hand-copied list of its steps. All three drifted — AGENTS.md named five
// steps while the gate had nine, and README/CONTRIBUTING listed an arbitrary
// subset of test scripts — so every doc taught a weaker bar than CI enforces.
// A doc that restates a machine-readable SSOT will eventually lie about it.
//
// This test fails if a doc starts enumerating the gate's steps again. Naming
// `npm run verify` is fine and encouraged; listing what it contains is not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const verify = pkg.scripts.verify;
assert.ok(verify, "package.json must define scripts.verify");

// The individual steps the gate actually runs, e.g. "check:design", "test:ops".
const steps = verify
  .split("&&")
  .map((s) => s.trim().replace(/^npm run /, ""))
  .filter((s) => s && !s.startsWith("tsc"));
assert.ok(steps.length >= 5, `expected a multi-step verify, got: ${verify}`);

// A doc "restates the gate" when it names MANY of the steps — naming one or
// two in passing (e.g. explaining what check:desktop covers) stays legal.
const RESTATEMENT_THRESHOLD = 4;
const DOCS = ["AGENTS.md", "README.md", "CONTRIBUTING.md"];

for (const doc of DOCS) {
  const text = readFileSync(join(ROOT, doc), "utf8");
  const named = steps.filter((step) => text.includes(step));
  assert.ok(
    named.length < RESTATEMENT_THRESHOLD,
    `${doc} enumerates ${named.length} of the verify gate's steps (${named.join(", ")}). ` +
      "Do not restate the gate — name `npm run verify` and let package.json stay the SSOT.",
  );
}

console.log(
  `✓ verify gate is not restated in ${DOCS.length} docs (${steps.length} steps stay in package.json)`,
);
