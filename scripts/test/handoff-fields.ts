// Pins the prompt library's handoff block to the fields the DoD gate enforces.
//
// The class this closes: on 2026-08-07 the fleet's dominant failure (64.6% of
// every DoD rejection) was "work not evidenced in the handoff" — because the
// bar demanded `lint:`/`tsc:` output while the prompt's field list only ever
// asked for `tests:`. `tests:` was filled 97% of the time; tsc/lint were filled
// 3 times ever. Agents write the shape they are shown.
//
// Fixing those prompts once would leave the trap armed for the next field added
// to the gate. This test is the automation: a field that the pre-check can
// REJECT you for must also be a field the prompts REQUEST. Add one without the
// other and CI fails here.
//
// Run: npx tsx scripts/test/handoff-fields.ts
import { DEMANDABLE_EVIDENCE_FIELDS } from "@/lib/orchestration/evidence-precheck";
import { PROMPT_TEMPLATES } from "@/config/prompt-library";

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

/** Templates the autopilot actually dispatches — these are the ones whose text
 *  reaches a worker that will later be graded by the DoD gate. */
const DISPATCHABLE = PROMPT_TEMPLATES.filter((t) => !!t.agentKey);
ok("there are dispatchable (agentKey) templates to check", DISPATCHABLE.length > 0);

/** A template "closes" if it tells the agent to write a handoff at all. */
const CLOSERS = DISPATCHABLE.filter((t) =>
  /status:\s*ready|update the session file|handoff/i.test(t.template),
);
ok("at least one dispatchable template writes a handoff", CLOSERS.length > 0);

// Must appear as an actual field LINE the agent can copy — `tsc:` mentioned
// mid-paragraph is exactly the state that produced the 0-fill rate, so a
// substring match here would pass on the very bug this test exists to catch.
const asFieldLine = (body: string, field: string) => new RegExp(`^${field}:`, "m").test(body);

for (const t of CLOSERS) {
  for (const field of DEMANDABLE_EVIDENCE_FIELDS) {
    ok(
      `${t.agentKey}: requests \`${field}:\` as a field line, not just prose`,
      asFieldLine(t.template, field),
    );
  }
}

// The reverse direction is deliberately NOT asserted: prompts may ask for more
// than the gate enforces (done/next/todos/health carry meaning for humans and
// for the next run's context, and nothing rejects a run for omitting them).

console.log(`\n${fail === 0 ? "✓" : "✗"} handoff-fields: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
