/**
 * The autopilot's two halves must grade the same thing.
 *
 * A project's `definition_of_done` is enforced by a cross-model judge that reads
 * ONLY the handoff (dod-gate.ts). Until 2026-08-02 the worker was never told
 * this: the bar reached it as one line of background in the project-context
 * block, so agents did good work, wrote `status: ready`, and were downgraded to
 * `partial` against a contract they'd never been shown. Two clean runs closed
 * on literally "No evidence that tests were run and passed".
 *
 * These tests pin the contract into the prompts an autopilot loop actually
 * fires, so a future prompt edit can't silently drop it and re-open the gap.
 *
 * Run: npx tsx scripts/test/handoff-contract.ts
 */
import { PROMPT_TEMPLATES } from "@/config/prompt-library";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** The loops that close runs — every one of them is graded by the DoD judge. */
const AUTOPILOT_KEYS = ["next_best", "test_and_fix"];

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  const autopilot = PROMPT_TEMPLATES.filter(
    (t) => t.agentKey && AUTOPILOT_KEYS.includes(t.agentKey),
  );

  check("every autopilot loop prompt is present", () => {
    for (const key of AUTOPILOT_KEYS) {
      assert(
        autopilot.some((t) => t.agentKey === key),
        `no prompt template found for agentKey=${key}`,
      );
    }
  });

  check("every autopilot prompt names the definition of done", () => {
    for (const t of autopilot) {
      assert(
        /definition of done/i.test(t.template),
        `${t.agentKey}: prompt never mentions the definition of done the judge grades against`,
      );
    }
  });

  check("every autopilot prompt says an unevidenced bar downgrades the run", () => {
    for (const t of autopilot) {
      assert(
        /partial/i.test(t.template),
        `${t.agentKey}: worker is not told that failing to evidence the bar closes the run partial`,
      );
    }
  });

  check("every autopilot prompt names the handoff fields the evidence goes in", () => {
    for (const t of autopilot) {
      for (const field of ["tests:", "tsc:", "lint:"]) {
        assert(
          t.template.includes(field),
          `${t.agentKey}: prompt never tells the worker to record \`${field}\``,
        );
      }
    }
  });

  check("an impossible check must be stated, not omitted", () => {
    // Silence reads as "skipped" to the judge. An honest "no suite" is
    // information — it names the next piece of work instead of hiding it.
    for (const t of autopilot) {
      assert(
        /no suite/i.test(t.template),
        `${t.agentKey}: prompt does not tell the worker to write impossibilities down verbatim`,
      );
    }
  });

  console.log(`\n${passed} handoff-contract test(s) passed`);
}

runTests();
