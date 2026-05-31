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

  // 2026-05-31: default flipped from "strategist" (L5 Mission, loose cannon)
  // to "beacon" (L3, popup + countdown auto-pick). The right starting trust
  // level for the five-level ladder Manual/Queue/Beacon/Continuous/Mission.
  check("DEFAULT_AUTO_INJECT_MODE is 'beacon'", () => {
    assert(DEFAULT_AUTO_INJECT_MODE === "beacon", `expected beacon, got ${DEFAULT_AUTO_INJECT_MODE}`);
  });

  check("Drizzle schema column default matches", () => {
    const schema = readFileSync("src/db/schema/beacon-settings.ts", "utf8");
    assert(/default\("beacon"\)/.test(schema), "beacon-settings.ts schema must default to 'beacon'");
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
    assert(!/settings\?\.auto_inject_mode\s*\?\?\s*"queue_only"/.test(route),
      "dispatch route must not drift back to queue_only as the implicit default");
  });

  check("Coercer returns the constant for unknown values", () => {
    const queries = readFileSync("src/db/queries/beacon-settings.ts", "utf8");
    assert(/coerceAutoInjectMode[\s\S]*DEFAULT_AUTO_INJECT_MODE/.test(queries),
      "coerceAutoInjectMode must return DEFAULT_AUTO_INJECT_MODE on miss");
  });

  check("Dispatch Groq fallback uses nextbest when queue empty", () => {
    const route = readFileSync("src/app/api/control/dispatch/route.ts", "utf8");
    assert(/queue\.length > 0 \? "queue" : "nextbest"/.test(route),
      "Groq fallback must return nextbest when queue is empty");
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

  check("Python offline fallback returns 'beacon'", () => {
    const py = readFileSync("scripts/_beacon_config.py", "utf8");
    assert(/get\(.auto_inject_mode., .beacon.\)/.test(py),
      "_beacon_config.py get_auto_inject_mode must default to 'beacon'");
  });

  check("Shell fallback (settings JSON missing) returns 'beacon'", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    const matches = sh.match(/auto_inject_mode/g) ?? [];
    assert(matches.length >= 2, "agent-hook-bridge.sh must read auto_inject_mode in both code paths");
    // The two bash fallback echoes must say beacon (one for the JSON-parse path, one for the Python-fallback path).
    const beaconFallbacks = (sh.match(/echo\s+beacon/g) ?? []).length;
    assert(beaconFallbacks >= 2, `expected ≥2 'echo beacon' fallbacks, got ${beaconFallbacks}`);
  });

  check("patch_project_state uses portable ISO date (not milliseconds)", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(!/iso_now=\$\(date --iso-8601=milliseconds\)/.test(sh),
      "patch_project_state must not call date --iso-8601=milliseconds — GNU date rejects it and set -e kills the stop hook before autopilot");
    assert(/patch_project_state[\s\S]*date -u \+%Y-%m-%dT%H:%M:%S/.test(sh),
      "patch_project_state must use portable UTC ISO timestamp");
  });

  check("Stop hook queue-empty falls through to next_best", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(/queue action but no queue item — falling through to next_best/.test(sh),
      "autopilot must fall through to next_best when dispatch says queue but queue is empty");
  });

  check("autopilot reads DB queue via beacon API", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(/_fetch_prompt_queue_json/.test(sh), "_fetch_prompt_queue_json helper must exist");
    assert(/\/api\/beacon\/queue\//.test(sh), "autopilot must fetch authoritative DB queue");
  });

  check("Stop hook loads daemon.env for production URL and token", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(/_load_cockpit_daemon_env/.test(sh), "hook must load ~/.config/cockpit/daemon.env");
    assert(/COCKPIT_BASE_URL/.test(sh), "hook must honor COCKPIT_BASE_URL");
    assert(/daemon\.env.*COCKPIT_\$\{key\}/.test(sh.replace(/\n/g, " ")),
      "token helper must read COCKPIT_DAEMON_TOKEN from daemon.env");
  });

  check("Daemon autopilot watchdog backs up Stop hook", () => {
    const sh = readFileSync("scripts/cockpit-daemon.sh", "utf8");
    assert(/_autopilot_watchdog/.test(sh), "daemon must include autopilot watchdog");
    assert(/agent-hook-bridge\.sh" autopilot/.test(sh), "watchdog must delegate to hook bridge");
  });

  check("Hook bridge exposes autopilot CLI mode", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(/autopilot\)/.test(sh), "agent-hook-bridge must support autopilot mode");
  });

  check("Stop hook runs autopilot before patch_project_state", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    const stopBlock = sh.slice(sh.indexOf("handle_stop()"), sh.indexOf("handle_notification()"));
    const autopilotIdx = stopBlock.indexOf("autopilot_dispatch_and_inject");
    const patchIdx = stopBlock.indexOf('patch_project_state "$TAB_NAME" "readyAt"');
    assert(autopilotIdx >= 0 && patchIdx >= 0 && autopilotIdx < patchIdx,
      "autopilot must run immediately after ready sentinel — before patch_project_state");
  });

  check("Autopilot queues inject via /api/inject when daemon token present", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(/queue_inject_via_api/.test(sh), "queue_inject_via_api helper must exist");
    assert(/\/api\/inject/.test(sh), "autopilot must queue through /api/inject");
  });

  check("Inject route accepts daemon bearer token", () => {
    const route = readFileSync("src/app/api/inject/route.ts", "utf8");
    assert(/getApiUserId/.test(route), "/api/inject must use getApiUserId for daemon auth");
    assert(!/getSessionUserId/.test(route), "/api/inject must not require browser session only");
  });

  check("Daemon watchdog detects session handoff without Stop hook", () => {
    const sh = readFileSync("scripts/cockpit-daemon.sh", "utf8");
    assert(/ready_source="handoff"/.test(sh), "watchdog must detect status:ready handoff files");
    assert(/handoff:\$\{ready_at\}/.test(sh), "handoff dedupe key must prevent re-fire loops");
  });

  check("inject_prompt resolves suffixed Zellij tab names", () => {
    const sh = readFileSync("scripts/agent-hook-lib.sh", "utf8");
    assert(/_resolve_live_tab_name/.test(sh), "live tab resolver must exist");
    assert(/_find_session_for_tab[\s\S]*_resolve_live_tab_name/.test(sh),
      "_find_session_for_tab must use live tab resolution");
  });

  check("Stop hook is autopilot — no popup race, no choice-file polling", () => {
    const sh = readFileSync("scripts/agent-hook-bridge.sh", "utf8");
    assert(!/beacon_launch/.test(sh), "beacon_launch (Chrome --app popup) must be removed from the bridge");
    assert(!/notify-choice\.py/.test(sh), "notify-choice.py (KDE action buttons) must not be called");
    assert(!/_choice_file/.test(sh), "the two-layer choice-file race must be gone");
    assert(/autopilot_dispatch_and_inject/.test(sh), "autopilot_dispatch_and_inject helper must exist");
    assert(/push_notify_stop/.test(sh), "push_notify_stop helper (Web Push) must exist");
    assert(/\/api\/control\/dispatch/.test(sh), "autopilot path must POST /api/control/dispatch");
    assert(/status: ready \| working/.test(sh), "autopilot prompts must require the status handoff field");
    const stopCalls = sh.match(/autopilot_dispatch_and_inject\s+"\$TAB_NAME"/g) ?? [];
    assert(stopCalls.length >= 1, "handle_stop must invoke autopilot_dispatch_and_inject");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
