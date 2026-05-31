/**
 * Inline tests for the dispatch-gate decisions. These gates short-circuit
 * /api/control/dispatch BEFORE any Groq call and BEFORE any auto-injection.
 * They are the safety primitives the user trusts: "if I write status:working,
 * autopilot stays out of my way." Live-incident regression coverage for
 * 2026-05-31 where the autopilot fired into the user's keystrokes mid-typing
 * despite the session handoff saying status:working.
 *
 * Run: npm run test:dispatch-gates
 */
import { evaluateDispatchGates } from "@/lib/orchestration/dispatch-gates";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("status:working short-circuits before any other gate", () => {
    const result = evaluateDispatchGates({
      status: "working",
      blockerCount: 0,
      mode: "strategist",
      queueLength: 5,
      streakSuffix: "",
    });
    assert(result !== null, "expected gate to fire");
    assert(result!.action === "off", `expected action=off, got ${result!.action}`);
    assert(result!.source === "status_gate", `expected source=status_gate, got ${result!.source}`);
  });

  check("status:working overrides queue_only mode (user-intent wins)", () => {
    const result = evaluateDispatchGates({
      status: "working",
      blockerCount: 0,
      mode: "queue_only",
      queueLength: 3,
      streakSuffix: "",
    });
    assert(result?.source === "status_gate", "status_gate must win over mode_gate even with queue items");
  });

  check("pending blocker short-circuits before mode gate", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 1,
      mode: "strategist",
      queueLength: 0,
      streakSuffix: "",
    });
    assert(result?.source === "blocker_gate", "blocker_gate must fire when count > 0");
    assert(result?.action === "off", "blocked dispatch must yield action=off");
    assert(result!.reason.includes("1 pending blocker"), "reason must surface the count");
  });

  check("blocker count plural in reason when > 1", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 3,
      mode: "strategist",
      queueLength: 0,
      streakSuffix: "",
    });
    assert(result!.reason.includes("3 pending blocker"), "reason must surface the actual count");
  });

  check("mode=off returns mode_gate when status and blockers are clean", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "off",
      queueLength: 5,
      streakSuffix: "",
    });
    assert(result?.source === "mode_gate", "mode_gate fires when user disabled autopilot");
    assert(result?.action === "off", "mode=off yields action=off");
  });

  check("mode=queue_only with empty queue yields action=off (idle)", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "queue_only",
      queueLength: 0,
      streakSuffix: "",
    });
    assert(result?.action === "off", "queue_only + empty queue = idle");
    assert(result?.reason.includes("queue is empty"), "reason must explain empty queue");
  });

  check("mode=queue_only with queue fires action=queue", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "queue_only",
      queueLength: 2,
      streakSuffix: "  [last 5: ✓✓✓]",
    });
    assert(result?.action === "queue", "queue_only + items = fire queue head");
    assert(result?.reason.includes("[last 5: ✓✓✓]"), "streak suffix must be appended");
  });

  check("mode=next_best returns canned action with streak suffix", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "next_best",
      queueLength: 0,
      streakSuffix: "  [last 5: ✗✓]",
    });
    assert(result?.action === "nextbest", "legacy mode = canned next_best");
    assert(result?.reason.includes("[last 5: ✗✓]"), "streak suffix appended");
  });

  check("mode=strategist with clean state yields null (fall through to Groq)", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "strategist",
      queueLength: 0,
      streakSuffix: "",
    });
    assert(result === null, "no gate fired → null → route proceeds to Groq composition");
  });

  check("empty status string is treated permissively (preserves legacy behavior)", () => {
    const result = evaluateDispatchGates({
      status: "",
      blockerCount: 0,
      mode: "strategist",
      queueLength: 0,
      streakSuffix: "",
    });
    assert(result === null, "missing status (legacy clients) does not block — preserves existing behavior");
  });

  check("status:ready with blockers still blocks (safety beats happy-path)", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 2,
      mode: "strategist",
      queueLength: 5,
      streakSuffix: "",
    });
    assert(result?.source === "blocker_gate", "blocker beats ready status");
  });

  console.log(`\n${passed} passed`);
}

runTests();
