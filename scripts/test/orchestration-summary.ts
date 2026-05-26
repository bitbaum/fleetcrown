/**
 * Inline tests for LOOP v2 orchestration handoff parsing and outcome inference.
 * Run: npm run test:orchestration-summary
 */
import { inferOutcome } from "@/lib/orchestration";
import { parseOrchestrationSummary } from "@/lib/orchestration/summary";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  pass ${label}`);
  };

  check("parses LOOP v2 evidence fields and marks verified ready work successful", () => {
    const summary = parseOrchestrationSummary([
      "status: ready",
      "last-3-same-dir: no",
      "wip-or-revert-in-last-5: no",
      "tsc: pass",
      "lint: pass",
      "tests: 12 pass - 0 fail",
      "todos: 0",
      "done: aligned handoff contract",
      "next:",
    ].join("\n"));

    assert(summary?.status === "ready", "expected ready status");
    assert(summary?.tsc === "pass", "expected tsc signal");
    assert(summary?.["last-3-same-dir"] === "no", "expected gravity signal");
    assert(inferOutcome({ summary }) === "success", "expected success");
  });

  check("retains legacy health summaries", () => {
    const summary = parseOrchestrationSummary("done: shipped\nhealth: good\ntests: 2 pass");
    assert(summary?.health === "good", "expected legacy health");
    assert(inferOutcome({ summary }) === "success", "expected legacy success");
  });

  check("failed LOOP v2 typecheck is an error", () => {
    const summary = parseOrchestrationSummary("status: ready\ntsc: fail(1)\ndone: attempted");
    assert(inferOutcome({ summary }) === "error", "expected typecheck error outcome");
  });

  check("nonzero failed test counts stay partial", () => {
    const summary = parseOrchestrationSummary("status: ready\ntests: 11 pass - 1 fail\ndone: attempted");
    assert(inferOutcome({ summary }) === "partial", "expected failed tests to stay partial");
  });

  console.log(`\n${passed} passed`);
}

runTests();
