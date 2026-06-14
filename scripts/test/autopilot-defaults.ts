/**
 * Inline self-tests for autopilot defaults — keeps the new-user experience
 * and the SSOT chain (constant → schema → queries → UI hook → settings UI)
 * aligned after the 2026-06-11 mode collapse. The bash bridge has been
 * retired (Session 1-2 of killing-the-bash-daemon); tests that asserted
 * on bash mechanics moved out with it.
 * Run: npm run test:autopilot-defaults
 */
import { readFileSync } from "fs";
import { DEFAULT_AUTO_INJECT_MODE } from "@/lib/constants/control";
import { AUTO_INJECT_MODE_VALUES, normalizeAutoInjectMode } from "@/config/beacon";

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

  // ── Default + enum invariants ────────────────────────────────────────────

  check("DEFAULT_AUTO_INJECT_MODE is 'on'", () => {
    // 2026-06-11 — collapsed from beacon (L3 popup) to binary on. New users
    // get fire-when-ready by default; safety rails (status:working, blockers,
    // health, no-op fuse) still apply.
    assert(DEFAULT_AUTO_INJECT_MODE === "on", `expected on, got ${DEFAULT_AUTO_INJECT_MODE}`);
  });

  check("AUTO_INJECT_MODE_VALUES is exactly ['off', 'on']", () => {
    assert(AUTO_INJECT_MODE_VALUES.length === 2, `expected 2 values, got ${AUTO_INJECT_MODE_VALUES.length}`);
    assert(AUTO_INJECT_MODE_VALUES[0] === "off", "first value must be 'off'");
    assert(AUTO_INJECT_MODE_VALUES[1] === "on",  "second value must be 'on'");
  });

  check("normalizeAutoInjectMode collapses legacy values", () => {
    assert(normalizeAutoInjectMode("off") === "off",         "off → off");
    assert(normalizeAutoInjectMode("on") === "on",           "on → on");
    assert(normalizeAutoInjectMode("queue_only") === "on",   "queue_only → on");
    assert(normalizeAutoInjectMode("beacon") === "on",       "beacon → on");
    assert(normalizeAutoInjectMode("next_best") === "on",    "next_best → on");
    assert(normalizeAutoInjectMode("strategist") === "on",   "strategist → on");
    assert(normalizeAutoInjectMode(null) === "on",           "null → on");
    assert(normalizeAutoInjectMode(undefined) === "on",      "undefined → on");
    assert(normalizeAutoInjectMode("garbage") === "on",      "unknown → on (safe default)");
  });

  // ── SSOT chain — every layer reads the same constant ────────────────────

  check("Drizzle schema column default matches", () => {
    const schema = readFileSync("src/db/schema/beacon-settings.ts", "utf8");
    assert(/default\("on"\)/.test(schema), "beacon-settings.ts schema must default to 'on'");
  });

  check("Queries DEFAULTS sources the constant (no drift)", () => {
    const queries = readFileSync("src/db/queries/beacon-settings.ts", "utf8");
    assert(/auto_inject_mode:\s*DEFAULT_AUTO_INJECT_MODE/.test(queries),
      "queries must use DEFAULT_AUTO_INJECT_MODE constant — no inline string defaults");
  });

  check("Dispatch route falls back to DEFAULT_AUTO_INJECT_MODE", () => {
    const route = readFileSync("src/app/api/control/dispatch/route.ts", "utf8");
    assert(/DEFAULT_AUTO_INJECT_MODE/.test(route),
      "dispatch route must use DEFAULT_AUTO_INJECT_MODE when no settings row exists");
    assert(!/"queue_only"|"beacon"|"next_best"|"strategist"/.test(route),
      "dispatch route must not reference any retired mode value");
  });

  check("Coercer returns the constant for unknown values", () => {
    const queries = readFileSync("src/db/queries/beacon-settings.ts", "utf8");
    assert(/coerceAutoInjectMode[\s\S]*DEFAULT_AUTO_INJECT_MODE/.test(queries),
      "coerceAutoInjectMode must return DEFAULT_AUTO_INJECT_MODE on miss");
  });

  check("Dispatch route returns nextbest on empty queue when on", () => {
    const gates = readFileSync("src/lib/orchestration/dispatch-gates.ts", "utf8");
    assert(/queueLength > 0 \? "queue" : "nextbest"/.test(gates),
      "dispatch-gates must return nextbest when queue is empty");
  });

  check("Automation policy hook seeds from DEFAULT_AUTO_INJECT_MODE", () => {
    const hook = readFileSync("src/hooks/use-automation-policy.ts", "utf8");
    assert(/useState<AutoInjectMode>\(DEFAULT_AUTO_INJECT_MODE\)/.test(hook),
      "useAutomationPolicy must not default to off before settings load");
  });

  check("Settings UI initial state seeds from the constant", () => {
    const ui = readFileSync("src/components/settings/BeaconSettings.tsx", "utf8");
    assert(/useState<AutoInjectMode>\(DEFAULT_AUTO_INJECT_MODE\)/.test(ui),
      "BeaconSettings must seed from DEFAULT_AUTO_INJECT_MODE — never an inline literal");
  });

  check("Inject route accepts runner bearer token", () => {
    const route = readFileSync("src/app/api/inject/route.ts", "utf8");
    assert(/getApiUserId/.test(route), "/api/inject must use getApiUserId for runner auth");
    assert(!/getSessionUserId/.test(route), "/api/inject must not require browser session only");
  });

  console.log(`\n${passed} passed`);
}

runTests();
