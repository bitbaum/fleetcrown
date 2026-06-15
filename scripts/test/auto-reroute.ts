/**
 * Inline tests for the auto-reroute decision (src/lib/auto-reroute.ts).
 *
 * This is the policy that makes "vendor-neutral" load-bearing: when an agent
 * hits a capacity wall, the fleet switches to the next installed agent ITSELF
 * under autopilot, instead of waiting for a human click. The high-stakes
 * property is loop safety — AGENT_FALLBACK_ORDER cycles, so the tests below
 * pin that an all-exhausted episode STOPS rather than churning forever.
 *
 * Run: npm run test:auto-reroute
 */
import {
  decideAutoReroute,
  shouldShowManualCapacityBanner,
  type AutoRerouteInput,
} from "@/lib/auto-reroute";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const base: AutoRerouteInput = {
  capacityIssue: true,
  automationOn: true,
  tabOpen: true,
  switchInFlight: false,
  suggestedFallback: "cursor",
  triedAgents: new Set<string>(),
};

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  // ── Happy path ──────────────────────────────────────────────────────────
  check("capacity + autopilot + fallback → reroute to fallback", () => {
    const d = decideAutoReroute(base);
    assert(d.reroute && d.toAgent === "cursor", "expected reroute to cursor");
  });

  // ── Skip gates (each must short-circuit, in priority order) ──────────────
  check("no capacity issue → no reroute", () => {
    const d = decideAutoReroute({ ...base, capacityIssue: false });
    assert(!d.reroute && d.reason === "no-capacity-issue", "expected no-capacity-issue");
  });

  check("autopilot off → never acts (human owns the project)", () => {
    const d = decideAutoReroute({ ...base, automationOn: false });
    assert(!d.reroute && d.reason === "autopilot-off", "expected autopilot-off");
  });

  check("switch already in flight → wait", () => {
    const d = decideAutoReroute({ ...base, switchInFlight: true });
    assert(!d.reroute && d.reason === "switch-in-flight", "expected switch-in-flight");
  });

  check("tab closed → nothing to switch inside of", () => {
    const d = decideAutoReroute({ ...base, tabOpen: false });
    assert(!d.reroute && d.reason === "tab-closed", "expected tab-closed");
  });

  check("no installed fallback → no reroute", () => {
    const d = decideAutoReroute({ ...base, suggestedFallback: null });
    assert(!d.reroute && d.reason === "no-fallback", "expected no-fallback");
  });

  // ── Loop safety: the reason this feature is dangerous without a guard ────
  check("fallback already tried this episode → stop (no infinite cycle)", () => {
    const d = decideAutoReroute({ ...base, triedAgents: new Set(["cursor"]) });
    assert(!d.reroute && d.reason === "all-tried", "expected all-tried");
  });

  check("cascade: claude→cursor→codex while each is fresh", () => {
    // After cursor was tried, the resolver suggests codex → still reroutes.
    const d = decideAutoReroute({
      ...base,
      suggestedFallback: "codex",
      triedAgents: new Set(["cursor"]),
    });
    assert(d.reroute && d.toAgent === "codex", "expected cascade to codex");
  });

  check("priority: autopilot-off beats fallback checks", () => {
    const d = decideAutoReroute({ ...base, automationOn: false, suggestedFallback: null });
    assert(!d.reroute && d.reason === "autopilot-off", "autopilot-off must win over no-fallback");
  });

  // ── Manual-banner visibility ────────────────────────────────────────────
  check("manual banner always shown when autopilot off", () => {
    assert(shouldShowManualCapacityBanner(false, null), "off → show banner");
    assert(shouldShowManualCapacityBanner(false, "all-tried"), "off → show banner regardless");
  });

  check("manual banner hidden under autopilot while it can act", () => {
    assert(!shouldShowManualCapacityBanner(true, null), "on + acting → hide");
    assert(!shouldShowManualCapacityBanner(true, "switch-in-flight"), "on + in-flight → hide");
  });

  check("manual banner surfaces under autopilot only when exhausted", () => {
    assert(shouldShowManualCapacityBanner(true, "all-tried"), "on + all-tried → surface");
    assert(shouldShowManualCapacityBanner(true, "no-fallback"), "on + no-fallback → surface");
  });

  console.log(`\n${passed}/${passed} auto-reroute tests passed`);
}

runTests();
