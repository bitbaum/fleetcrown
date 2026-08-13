/**
 * Inline tests for the tool loop's fact-budget policy
 * (lib/agent/fact-budget.ts). The invariant under test: TOOL RESULTS ALWAYS
 * SURVIVE shedding. Two production incidents came from head-keeping slices
 * silently deleting the tail — the model fetched the approval queue and then
 * answered "Not in your data." because the facts it fetched never reached the
 * prompt.
 *
 * Run: npm run test:fact-budget
 */
import { trimFactsToBudget, mergeFactsWithCap } from "@/lib/agent/fact-budget";
import type { Fact } from "@/lib/agent/core/facts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const fact = (subject: string): Fact =>
  ({ kind: "document", subject, source: "test", values: { title: subject } }) as unknown as Fact;

const range = (prefix: string, n: number): Fact[] =>
  Array.from({ length: n }, (_, i) => fact(`${prefix}${i}`));

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("merge under cap keeps everything in order", () => {
    const out = mergeFactsWithCap(range("seed", 5), range("tool", 3), 40);
    assert(out.length === 8 && out[5]!.subject === "tool0", `got ${out.length}`);
  });

  check("merge at full cap: EVERY fresh tool fact survives (the prod bug)", () => {
    const out = mergeFactsWithCap(range("seed", 40), range("tool", 8), 40);
    const tools = out.filter((f) => f.subject.startsWith("tool"));
    assert(out.length === 40 && tools.length === 8, `kept ${tools.length}/8 tool facts`);
    assert(out[out.length - 1]!.subject === "tool7", "fresh facts must sit at the tail");
  });

  check("merge with more fresh facts than the cap keeps the first cap of them", () => {
    const out = mergeFactsWithCap(range("seed", 10), range("tool", 50), 40);
    assert(out.length === 40 && out.every((f) => f.subject.startsWith("tool")), "cap of fresh only");
  });

  check("trim under budget is identity", () => {
    const all = range("f", 10);
    assert(trimFactsToBudget(all, 10) === all, "no copy when it already fits");
  });

  check("trim keeps both ends — tail (tool results) survives", () => {
    const all = [...range("seed", 35), ...range("tool", 5)];
    const out = trimFactsToBudget(all, 10);
    const tools = out.filter((f) => f.subject.startsWith("tool"));
    assert(out.length === 10 && tools.length === 5, `kept ${tools.length}/5 tool facts at budget 10`);
    assert(out[0]!.subject === "seed0", "head of seed also kept");
  });

  check("trim to odd budget still totals the budget", () => {
    const out = trimFactsToBudget(range("f", 40), 5);
    assert(out.length === 5, `got ${out.length}`);
  });

  console.log(`\n${passed} passed`);
}

runTests();
