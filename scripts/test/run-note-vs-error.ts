/**
 * A run that did not fail must not explain itself in the error style, or in
 * the reaper's vocabulary.
 *
 * /control showed this on a project card whose run outcome was `partial` — a
 * SUCCESS — rendered in the red `ui-error` box:
 *
 *   "Reaped as timeout, but the repo shows work during the run window —
 *    corrected to partial (see evidence)"
 *
 * Two defects in one line: the reaper wrote non-failure explanations into
 * payload.error, and the copy was written for whoever maintains the reaper.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXECUTOR_COPY } from "../../src/config/executor-copy";
import { normalizeRepoWorkEvidence } from "../../src/lib/repo-evidence";

const root = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// --- the copy is for a person -------------------------------------------
for (const [name, text] of [
  ["reapedButHandoffWritten", EXECUTOR_COPY.honesty.reapedButHandoffWritten],
  ["reapedButWorkInRepo", EXECUTOR_COPY.honesty.reapedButWorkInRepo],
] as const) {
  assert.ok(text.length > 0, `${name} must exist`);
  for (const jargon of ["Reaped", "reaper", "Reaper", "(see evidence)"]) {
    assert.ok(
      !text.includes(jargon),
      `${name} still speaks the reaper's dialect: "${jargon}" in "${text}"`,
    );
  }
  assert.ok(
    /partial/.test(text) && /fail/.test(text),
    `${name} must say what the outcome IS and that it is not a failure: "${text}"`,
  );
}

// --- neither writer may put a non-failure into payload.error -------------
// The reaper's two call sites are the ones that did it. Checked as source text
// because both are SQL fragments built with jsonb_set — there is no function
// to call and assert on without a database.
const reaper = read("src/db/queries/orchestration-runs.ts");
const evidence = read("src/lib/orchestration/reap-evidence.ts");

assert.ok(
  !evidence.includes("'{error}'"),
  "reap-evidence corrects a timeout UP to partial — it must never write payload.error",
);
assert.ok(
  evidence.includes("'{note}'") && evidence.includes("reapedButWorkInRepo"),
  "reap-evidence must write the shared note copy",
);
assert.ok(
  reaper.includes("'{note}'") && reaper.includes("reapedButHandoffWritten"),
  "a reaped run that had written a handoff is partial — it explains itself with a note",
);

// No literal prose left in either writer: the copy has one home.
for (const [name, src] of [["reaper", reaper], ["reap-evidence", evidence]] as const) {
  assert.ok(
    !/'Reaped as timeout|'Reaper closed an open run/.test(src),
    `${name} still hardcodes reaper prose instead of importing EXECUTOR_COPY`,
  );
}

// --- evidence is validated, not cast ------------------------------------
const good = { kind: "pr", url: "https://github.com/o/r/pull/1", title: "Fix", atMs: 1 };
assert.deepEqual(normalizeRepoWorkEvidence(good), good);
assert.equal(normalizeRepoWorkEvidence(null), null);
assert.equal(normalizeRepoWorkEvidence("pr"), null);
assert.equal(
  normalizeRepoWorkEvidence({ ...good, kind: "commit" }),
  null,
  "an unknown kind drops the block — the card labels the link BY kind",
);
assert.equal(normalizeRepoWorkEvidence({ ...good, url: "" }), null, "an empty url is not a link");
assert.equal(normalizeRepoWorkEvidence({ ...good, atMs: "1" }), null);
assert.equal(normalizeRepoWorkEvidence({ ...good, atMs: NaN }), null);

// --- the card styles by the run's own state, not by which field is set ---
// Rows already in the database carry the old sentences in payload.error, so
// the fix cannot depend on the writer alone.
const card = read("src/components/control/project-card-helpers.tsx");
assert.ok(
  /run\.state === ORCH_STATE\.ERROR[\s\S]{0,120}ui-error/.test(card),
  "the error style must be gated on the run having actually failed",
);

console.log("✓ run note-vs-error tests passed");
