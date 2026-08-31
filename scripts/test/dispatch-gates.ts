/**
 * Inline tests for the dispatch-gate decisions. These gates short-circuit
 * /api/control/dispatch BEFORE any auto-injection. They are the safety
 * primitives the user trusts: "if I write status:working, autopilot stays
 * out of my way." Live-incident regression coverage for 2026-05-31 where
 * the autopilot fired into the user's keystrokes mid-typing despite the
 * session handoff saying status:working.
 *
 * The 5-tier autopilot ladder collapsed to off|on on 2026-06-11; tests
 * exercise the simpler logic. The strategist composer path is gone.
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

  // ── Safety gates (must fire regardless of mode) ────────────────────────

  check("status:working short-circuits before any other gate", () => {
    const result = evaluateDispatchGates({
      status: "working",
      blockerCount: 0,
      mode: "on",
      queueLength: 5,
      streakSuffix: "",
    });
    assert(result !== null, "expected gate to fire");
    assert(result!.action === "off", `expected action=off, got ${result!.action}`);
    assert(result!.source === "status_gate", `expected source=status_gate, got ${result!.source}`);
  });

  check("status:working overrides on mode + queue (user-intent wins)", () => {
    const result = evaluateDispatchGates({
      status: "working",
      blockerCount: 0,
      mode: "on",
      queueLength: 3,
      streakSuffix: "",
    });
    assert(
      result?.source === "status_gate",
      "status_gate must win over mode_gate even with queue items",
    );
  });

  check("status:blocked short-circuits before any other gate", () => {
    const result = evaluateDispatchGates({
      status: "blocked",
      blockerCount: 0,
      mode: "on",
      queueLength: 5,
      streakSuffix: "",
    });
    assert(result?.action === "off", "blocked status must yield action=off");
    assert(result?.source === "status_gate", `expected source=status_gate, got ${result?.source}`);
    assert(result!.reason.includes("status:blocked"), "reason must name blocked status");
  });

  check("pending blocker short-circuits before mode gate", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 1,
      mode: "on",
      queueLength: 0,
      streakSuffix: "",
    });
    assert(result?.source === "blocker_gate", "blocker_gate must fire when count > 0");
    assert(result?.action === "off", "blocked dispatch must yield action=off");
    assert(result!.reason.includes("1 pending blocker"), "reason must surface the count");
  });

  check("no-op fuse short-circuits before mode gate", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "on",
      queueLength: 0,
      streakSuffix: "",
      noOpCount: 3,
    });
    assert(result?.action === "off", "no-op fuse must yield action=off");
    assert(result?.source === "status_gate", `expected source=status_gate, got ${result?.source}`);
    assert(result!.reason.includes("3 consecutive no-op"), "reason must name the no-op count");
  });

  check("blocker count plural in reason when > 1", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 3,
      mode: "on",
      queueLength: 0,
      streakSuffix: "",
    });
    assert(result!.reason.includes("3 pending blocker"), "reason must surface the actual count");
  });

  // ── Mode gates (binary off / on) ───────────────────────────────────────

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

  check("mode=on with queue items fires action=queue", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "on",
      queueLength: 2,
      streakSuffix: "  [last 5: ✓✓✓]",
    });
    assert(result?.action === "queue", "on + items = fire queue head");
    assert(result?.source === "mode_gate", `expected source=mode_gate, got ${result?.source}`);
    assert(result?.reason.includes("[last 5: ✓✓✓]"), "streak suffix must be appended");
  });

  check("mode=on with empty queue fires action=nextbest", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 0,
      mode: "on",
      queueLength: 0,
      streakSuffix: "  [last 5: ✗✓]",
    });
    assert(result?.action === "nextbest", "on + empty queue = canned next_best");
    assert(result?.source === "empty_queue", `expected source=empty_queue, got ${result?.source}`);
    assert(result?.reason.includes("queue empty"), "reason must explain empty queue");
    assert(result?.reason.includes("[last 5: ✗✓]"), "streak suffix appended");
  });

  check("empty status string is treated permissively (preserves legacy behavior)", () => {
    const result = evaluateDispatchGates({
      status: "",
      blockerCount: 0,
      mode: "on",
      queueLength: 0,
      streakSuffix: "",
    });
    // Empty status falls through to mode handling — autopilot fires.
    assert(
      result?.action === "nextbest",
      "missing status (legacy clients) does not block — autopilot fires",
    );
  });

  check("status:ready with blockers still blocks (safety beats happy-path)", () => {
    const result = evaluateDispatchGates({
      status: "ready",
      blockerCount: 2,
      mode: "on",
      queueLength: 5,
      streakSuffix: "",
    });
    assert(result?.source === "blocker_gate", "blocker beats ready status");
  });

  console.log(`\n${passed} passed`);
}

runTests();
