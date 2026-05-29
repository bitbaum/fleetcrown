/**
 * Inline self-tests for autopilot defaults — keeps the new-user experience
 * locked to the autopilot policy across the schema, queries, constants, and
 * shell/Python fallbacks.
 * Run: npm run test:autopilot-defaults
 */
import { readFileSync } from "fs";
import { DEFAULT_AUTO_INJECT_MODE } from "@/lib/constants/control";

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

  check("DEFAULT_AUTO_INJECT_MODE is 'strategist'", () => {
    assert(DEFAULT_AUTO_INJECT_MODE === "strategist", `expected strategist, got ${DEFAULT_AUTO_INJECT_MODE}`);
  });

  check("Drizzle schema column default matches", () => {
    const schema = readFileSync("src/db/schema/beacon-settings.ts", "utf8");
    assert(/default\("strategist"\)/.test(schema), "beacon-settings.ts schema must default to 'strategist'");
  });

  check("Queries DEFAULTS sources the constant (no drift)", () => {
    const queries = readFileSync("src/db/queries/beacon-settings.ts", "utf8");
    assert(/auto_inject_mode:\s*DEFAULT_AUTO_INJECT_MODE/.test(queries),
      "queries must use DEFAULT_AUTO_INJECT_MODE constant — no inline string defaults");
  });

  check("Coercer returns the constant for unknown values", () => {
    const queries = readFileSync("src/db/queries/beacon-settings.ts", "utf8");
    assert(/coerceAutoInjectMode[\s\S]*DEFAULT_AUTO_INJECT_MODE/.test(queries),
      "coerceAutoInjectMode must return DEFAULT_AUTO_INJECT_MODE on miss");
  });

  check("Settings UI initial state seeds from the constant", () => {
    const ui = readFileSync("src/components/settings/BeaconSettings.tsx", "utf8");
    assert(/useState<AutoInjectMode>\(DEFAULT_AUTO_INJECT_MODE\)/.test(ui),
      "BeaconSettings must seed from DEFAULT_AUTO_INJECT_MODE — never an inline literal");
  });

  check("Python offline fallback returns 'strategist'", () => {
    const py = readFileSync("scripts/_beacon_config.py", "utf8");
    assert(/get\(.auto_inject_mode., .strategist.\)/.test(py),
      "_beacon_config.py get_auto_inject_mode must default to 'strategist'");
  });

  check("Shell fallback (settings JSON missing) returns 'strategist'", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    const matches = sh.match(/auto_inject_mode/g) ?? [];
    assert(matches.length >= 2, "agent-hook-bridge.sh must read auto_inject_mode in both code paths");
    // The two bash fallback echoes must say strategist (one for the JSON-parse path, one for the Python-fallback path).
    const strategistFallbacks = (sh.match(/echo\s+strategist/g) ?? []).length;
    assert(strategistFallbacks >= 2, `expected ≥2 'echo strategist' fallbacks, got ${strategistFallbacks}`);
  });

  check("Stop hook is autopilot — no popup race, no choice-file polling", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(!/beacon_launch/.test(sh), "beacon_launch (Chrome --app popup) must be removed from the bridge");
    assert(!/notify-choice\.py/.test(sh), "notify-choice.py (KDE action buttons) must not be called");
    assert(!/_choice_file/.test(sh), "the two-layer choice-file race must be gone");
    assert(/autopilot_dispatch_and_inject/.test(sh), "autopilot_dispatch_and_inject helper must exist");
    assert(/push_notify_stop/.test(sh), "push_notify_stop helper (Web Push) must exist");
    assert(/\/api\/control\/dispatch/.test(sh), "autopilot path must POST /api/control/dispatch");
    // Ensure handle_stop *calls* the autopilot helper (not only declares it).
    const stopCalls = sh.match(/autopilot_dispatch_and_inject\s+"\$TAB_NAME"/g) ?? [];
    assert(stopCalls.length >= 1, "handle_stop must invoke autopilot_dispatch_and_inject");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
