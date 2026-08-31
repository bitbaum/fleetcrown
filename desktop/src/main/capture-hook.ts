/**
 * Claude UserPromptSubmit capture hook — installer.
 *
 * /api/activity/capture has existed on the cloud side since the activity-SSOT
 * work, but nothing ever installed the Claude hook that calls it — so prompts
 * the user typed DIRECTLY into a Claude tab (zellij, or /terminal Type mode)
 * never reached the activity ledger. Dispatched work was recorded (inject-core,
 * tab-inject); typed work was invisible. Classic "exists but not wired".
 *
 * Fleet Runner is the right installer: it is the component guaranteed to live
 * on the machine where the user types into Claude, and it owns the ck_* token.
 * On startup (and whenever a token is saved) it ensures:
 *
 *   1. ~/.claude/hooks/fleetcrown-capture.sh — reads the hook's stdin JSON
 *      (Claude sends { prompt, cwd, session_id, … }) and forwards it verbatim
 *      to /api/activity/capture. The route's zod schema strips unknown keys,
 *      so no jq/reshaping is needed — curl is the only dependency. The token
 *      is read from the runner token file AT CALL TIME, so a token rotation
 *      never leaves a stale credential baked into the script.
 *
 *   2. ~/.claude/settings.json — a hooks.UserPromptSubmit entry pointing at
 *      the script, merged idempotently (never duplicated, never clobbering
 *      the user's other hooks or settings).
 *
 * The hook itself is strictly fire-and-forget: stdin is drained first, curl
 * runs backgrounded with a short timeout, and the script always exits 0 — a
 * dead cloud or missing token must never delay or fail the user's prompt.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { APP_URL } from "@/config/brand";
import { loadToken, tokenPath } from "./token-store";

const CLAUDE_DIR = join(homedir(), ".claude");
const HOOKS_DIR = join(CLAUDE_DIR, "hooks");
const HOOK_SCRIPT = join(HOOKS_DIR, "fleetcrown-capture.sh");
const END_HOOK_SCRIPT = join(HOOKS_DIR, "fleetcrown-session-end.sh");
const SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");

// Pre-runner capture hook (June 2026 era): posted to localhost:3000, where
// nothing listens on a normal setup — every typed prompt was silently dropped
// for months. One capture hook is the SSOT; if both stayed registered, every
// prompt would fire two capture POSTs. Deregistered on sight.
const LEGACY_HOOK_MARKER = "fleet-user-prompt.sh";

/** Same base-URL resolution as poller/pusher: dev override, else brand SSOT. */
function baseUrl(): string {
  return ((process.env.FLEETCROWN_WEB_URL || "").trim() || APP_URL).replace(/\/$/, "");
}

/**
 * Both hooks are the same six lines pointed at different endpoints: drain
 * stdin, forward it verbatim, never block the user. Generated from one
 * template so the capture and session-end scripts cannot drift in the parts
 * that matter (timeout, backgrounding, exit 0, token read at call time).
 */
function hookScriptBody(event: string, endpoint: string, purpose: string): string {
  return `#!/usr/bin/env bash
# FleetCrown ${event} hook — managed by Fleet Runner (capture-hook.ts).
# ${purpose}
# Do not edit; Fleet Runner rewrites this file on startup.
TOKEN_FILE="${tokenPath}"
payload="$(cat)"
[ -r "$TOKEN_FILE" ] || exit 0
( printf '%s' "$payload" | curl -s -m 5 -X POST \\
    -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \\
    -H "Content-Type: application/json" \\
    --data-binary @- \\
    "${baseUrl()}${endpoint}" >/dev/null 2>&1 & )
exit 0
`;
}

type HookCommand = { type?: string; command?: string };
type HookEntry = { matcher?: string; hooks?: HookCommand[] };

/** Idempotently write the script + merge the settings.json entry.
 *  Silent no-op when there is no token yet (nothing to authenticate with —
 *  runs again after pairing) or on Windows (the hook is a bash script). */
export function ensureCaptureHook(): void {
  if (process.platform === "win32") return;
  if (!loadToken()) return;
  try {
    if (!existsSync(HOOKS_DIR)) mkdirSync(HOOKS_DIR, { recursive: true });
    const body = hookScriptBody(
      "UserPromptSubmit",
      "/api/activity/capture",
      "Forwards directly-typed Claude prompts to the FleetCrown activity ledger,",
    );
    const current = existsSync(HOOK_SCRIPT) ? readFileSync(HOOK_SCRIPT, "utf8") : null;
    if (current !== body) {
      writeFileSync(HOOK_SCRIPT, body, "utf8");
      console.log(`[capture-hook] wrote ${HOOK_SCRIPT}`);
    }
    chmodSync(HOOK_SCRIPT, 0o755);

    // The closing edge of the same turn. Without it a session reports that it
    // STARTED work and never that it stopped, so Control would show every
    // project that ever ran an agent as permanently "working" until the TTL
    // expired — a lie in the opposite direction from the "0 working" it fixes.
    const endBody = hookScriptBody(
      "Stop",
      "/api/activity/session-end",
      "Closes the agent turn opened by the capture hook, so Control can show what is working NOW,",
    );
    const endCurrent = existsSync(END_HOOK_SCRIPT) ? readFileSync(END_HOOK_SCRIPT, "utf8") : null;
    if (endCurrent !== endBody) {
      writeFileSync(END_HOOK_SCRIPT, endBody, "utf8");
      console.log(`[capture-hook] wrote ${END_HOOK_SCRIPT}`);
    }
    chmodSync(END_HOOK_SCRIPT, 0o755);

    let settings: Record<string, unknown> = {};
    if (existsSync(SETTINGS_FILE)) {
      try {
        settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as Record<string, unknown>;
      } catch {
        // Unparseable settings.json is the user's to fix — never clobber it.
        console.warn(
          "[capture-hook] ~/.claude/settings.json is not valid JSON; skipping hook registration",
        );
        return;
      }
    }
    const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
    let entries: HookEntry[] = Array.isArray(hooks.UserPromptSubmit)
      ? (hooks.UserPromptSubmit as HookEntry[])
      : [];
    let changed = false;

    // Strip the dead legacy hook wherever it appears; drop entries emptied out.
    entries = entries.flatMap((entry) => {
      const before = entry.hooks ?? [];
      const kept = before.filter(
        (h) => !(typeof h.command === "string" && h.command.includes(LEGACY_HOOK_MARKER)),
      );
      if (kept.length !== before.length) {
        changed = true;
        console.log("[capture-hook] deregistered legacy fleet-user-prompt.sh hook");
        if (kept.length === 0) return [];
        return [{ ...entry, hooks: kept }];
      }
      return [entry];
    });

    const registered = entries.some((entry) =>
      (entry.hooks ?? []).some(
        (h) => typeof h.command === "string" && h.command.includes("fleetcrown-capture.sh"),
      ),
    );
    if (!registered) {
      entries.push({ hooks: [{ type: "command", command: HOOK_SCRIPT }] });
      changed = true;
      console.log("[capture-hook] registered UserPromptSubmit hook in ~/.claude/settings.json");
    }
    if (changed) {
      hooks.UserPromptSubmit = entries;
      settings.hooks = hooks;
    }

    // Stop: append to whatever the user already runs there, never replace it.
    // ~/.claude/settings.json is the user's file — this installer owns exactly
    // its own two commands and nothing else in it.
    let stopEntries: HookEntry[] = Array.isArray(hooks.Stop) ? (hooks.Stop as HookEntry[]) : [];
    const endRegistered = stopEntries.some((entry) =>
      (entry.hooks ?? []).some(
        (h) => typeof h.command === "string" && h.command.includes("fleetcrown-session-end.sh"),
      ),
    );
    if (!endRegistered) {
      stopEntries = [...stopEntries, { hooks: [{ type: "command", command: END_HOOK_SCRIPT }] }];
      hooks.Stop = stopEntries;
      settings.hooks = hooks;
      changed = true;
      console.log("[capture-hook] registered Stop hook in ~/.claude/settings.json");
    }

    if (changed) {
      writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n", "utf8");
    }
  } catch (e) {
    // Best-effort: a failed install must never break runner startup.
    console.warn("[capture-hook] install failed:", (e as Error).message);
  }
}
