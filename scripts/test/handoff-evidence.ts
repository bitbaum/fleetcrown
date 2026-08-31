// Does the evidence an agent writes actually REACH the model that grades it?
//
// The DoD judge is prompted to check typecheck, lint and commit evidence. For
// months it was never shown any: the fields existed in the worker's contract
// and in the judge's prompt, and every layer in between quietly dropped them.
// Production, 2026-08-06 — 56 runs with a summary:
//
//     tests filled 55 · tsc filled 0 · lint filled 0 · commit filled 0
//
// Zero is not "agents are sloppy", it is a severed pipe. And it was the SECOND
// time: `block-reason`/`no-op-count` were lost the same way (see the note in
// orchestration/summary.ts). Both times the cause was a hand-written field list
// drifting from the contract, and both times it was invisible — a dropped field
// defaults to "", an empty field is filtered out of the judge's prompt, and the
// judge answers "no evidence" exactly as instructed.
//
// So this test does not check the three fields we just fixed. It walks
// DOD_EVIDENCE_FIELDS — the SSOT for what the grader can see — and fails if ANY
// of them cannot survive the trip from handoff to judge. Add a field there and
// this tells you every layer you still owe.
//
// Run: npx tsx scripts/test/handoff-evidence.ts
import { DOD_EVIDENCE_FIELDS, summaryForJudge } from "@/lib/orchestration/dod-gate";
import { closeRunFromSession, type OpenRun } from "@/lib/orchestration/close-from-session";
import { dbRowToSession } from "@/lib/project-session";
import { parseSessionFile } from "@/lib/session-content";
import type { SessionState } from "@/lib/control-types";

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

// A distinctive sentinel per field, so "did it arrive" is unambiguous — a
// generic "ok" could be matched by a neighbouring field's text.
const sentinel = (field: string) => `EVIDENCE-${field.toUpperCase()}-42`;

// deliveredAt is required for any handoff-driven close: an undelivered run
// cannot have produced the handoff (see undelivered-run-close.ts). This suite
// tests evidence plumbing, so its run is a delivered one.
const RUN: OpenRun = {
  startedAt: new Date(1_000),
  finishedAt: null,
  payload: { deliveredAt: new Date(1_000).toISOString() },
};
const HANDOFF_MTIME = 2_000; // post-dates the run, so the close is allowed

// ── 1. Handoff file → judge ──────────────────────────────────────────────────
// The full trip an agent's `session.md` takes on the local runtime.
const handoffText = [
  "status: ready",
  ...DOD_EVIDENCE_FIELDS.map(([field]) => `${field}: ${sentinel(String(field))}`),
].join("\n");

const parsed = parseSessionFile(handoffText);
const fileSession = { ...parsed, mtime: HANDOFF_MTIME } as unknown as SessionState;
const filePatch = closeRunFromSession(RUN, fileSession);

ok("a ready handoff closes the run", filePatch !== null);
if (filePatch) {
  const seen = summaryForJudge(filePatch.summary);
  for (const [field] of DOD_EVIDENCE_FIELDS) {
    ok(`handoff file → judge carries \`${String(field)}\``, seen.includes(sentinel(String(field))));
  }
}

// ── 2. Pushed state (DB row) → judge ─────────────────────────────────────────
// The hosted path: the runner POSTs the handoff, it lands in `project_states`,
// and the close reads it back. A field with no column here is lost silently —
// this is exactly where tsc/lint/commit died.
const dbRow = {
  sessionStatus: "ready",
  sessionDone: sentinel("done"),
  sessionNext: sentinel("next"),
  sessionTests: sentinel("tests"),
  sessionTodos: "0",
  sessionHealth: sentinel("health"),
  sessionTsc: sentinel("tsc"),
  sessionLint: sentinel("lint"),
  sessionCommit: sentinel("commit"),
  sessionUpdatedAt: new Date(HANDOFF_MTIME),
};

const dbSession = dbRowToSession(dbRow as unknown as Parameters<typeof dbRowToSession>[0]);
ok("a persisted ready handoff projects to a session", dbSession !== null);

if (dbSession) {
  const dbPatch = closeRunFromSession(RUN, dbSession);
  ok("persisted handoff closes the run", dbPatch !== null);
  if (dbPatch) {
    const seen = summaryForJudge(dbPatch.summary);
    for (const [field] of DOD_EVIDENCE_FIELDS) {
      ok(
        `project_states → judge carries \`${String(field)}\``,
        seen.includes(sentinel(String(field))),
      );
    }
  }
}

// ── 3. The failure mode itself ───────────────────────────────────────────────
// An empty field is dropped from the judge's prompt entirely (deliberate — it
// keeps the prompt tight). That is WHY a severed pipe is invisible rather than
// noisy, so pin the behaviour: absence must look like absence, not like a
// passing check.
const blankPatch = closeRunFromSession(RUN, {
  status: "ready",
  done: "did the thing",
  next: "",
  tests: "",
  todos: "",
  health: "",
  mtime: HANDOFF_MTIME,
});
if (blankPatch) {
  const seen = summaryForJudge(blankPatch.summary);
  ok(
    "an unevidenced check is absent from the judge's view, not blank-passed",
    !/Typecheck:/.test(seen),
  );
  ok("what the agent did still reaches the judge", seen.includes("did the thing"));
}

console.log(`\n${fail === 0 ? "✓" : "✗"} handoff-evidence: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
