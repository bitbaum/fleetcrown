import fs from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { exec, execSync, execFileSync } from "child_process";
import { promisify } from "util";
import { APP_SLUG } from "@/config/brand";
import { stripAnsi } from "@/lib/ansi";

// Filename prefix the zsh typing hooks write to /tmp. Must match
// scripts/install-cockpit-hooks.sh (which generates the hooks) — derived
// from APP_SLUG so a rename flips both sides together.
const TYPING_FILE_PREFIX = `${APP_SLUG}-typing-`;

const execAsync = promisify(exec);

/** Single-quote-escape a value for safe interpolation into a bash command string. */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function cleanZellijLines(stdout: string): string[] {
  return stripAnsi(stdout)
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.includes("[Created "));
}

export function getZellijSessionsSync(): string[] {
  try {
    const stdout = execSync("zellij list-sessions --no-formatting 2>/dev/null", {
      encoding: "utf-8",
      timeout: 2000,
    });
    return stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getTabsForSessionSync(session: string): string[] {
  const commands = [
    `zellij --session ${shellEscape(session)} action query-tab-names 2>/dev/null`,
    `ZELLIJ_SESSION_NAME=${shellEscape(session)} zellij action query-tab-names 2>/dev/null`,
  ];
  for (const command of commands) {
    try {
      const stdout = execSync(command, { encoding: "utf-8", timeout: 2000 });
      const tabs = cleanZellijLines(stdout);
      if (tabs.length > 0) return tabs;
    } catch {
      // Try the next addressing mode.
    }
  }
  return [];
}

/** Find which Zellij session (if any) currently hosts a tab with the given name (case-insensitive match on tab). */
function findSessionForTab(tab: string): string | null {
  const sessions = getZellijSessionsSync();
  for (const s of sessions) {
    const tabs = getTabsForSessionSync(s);
    if (tabs.some((t) => t.toLowerCase() === tab.toLowerCase())) {
      return s;
    }
  }
  return null;
}

/** Query Zellij for currently open tab names. Returns [] if Zellij is unavailable. */
export async function getZellijTabs(): Promise<string[]> {
  const sessions = getZellijSessionsSync();
  if (sessions.length > 0) {
    const tabs = sessions.flatMap(getTabsForSessionSync);
    if (tabs.length > 0) return [...new Set(tabs)];
  }

  try {
    const { stdout } = await execAsync("zellij action query-tab-names 2>/dev/null || true", { timeout: 2000 });
    return cleanZellijLines(stdout);
  } catch {
    return [];
  }
}

const DUMP_CMD = `zellij action dump-layout 2>/dev/null | grep 'focus=true' | grep 'tab name=' | sed 's/.*tab name="\\([^"]*\\)".*/\\1/' | head -1`;

/** Build a dump-layout command qualified to a specific session when known. */
function buildDumpCmd(session: string | null): string {
  if (session) {
    return `zellij --session ${shellEscape(session)} action dump-layout 2>/dev/null | grep 'focus=true' | grep 'tab name=' | sed 's/.*tab name="\\([^"]*\\)".*/\\1/' | head -1`;
  }
  return DUMP_CMD;
}

/** Return the name of the currently focused Zellij tab, or null if unavailable. */
function getCurrentTab(sessionHint: string | null = null): string | null {
  try {
    const cmd = buildDumpCmd(sessionHint);
    const result = execFileSync("bash", ["-c", cmd], { timeout: 2000 }).toString().trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Poll dump-layout until the named tab has focus, up to maxWaitMs.
 * Returns true on success, false on timeout. Callers that mutate the
 * focused pane (write-chars, etc.) MUST check the return value — if the
 * tab doesn't exist or zellij isn't reachable, the polled focus never
 * matches and writing characters then types into whatever pane IS focused,
 * which can be the user's private terminal session.
 */
function waitForTabFocus(tab: string, maxWaitMs = 1000, session: string | null = null): boolean {
  const deadline = Date.now() + maxWaitMs;
  const cmd = buildDumpCmd(session);
  while (Date.now() < deadline) {
    try {
      const active = execFileSync("bash", ["-c", cmd], { timeout: 2000 }).toString().trim();
      if (active === tab) return true;
    } catch { /* dump-layout unavailable or parse failed — fall through */ }
    execSync("sleep 0.05");
  }
  return false;
}

/**
 * Check whether a user is actively at the interactive ZSH prompt in a given
 * Zellij tab.  ZSH hooks write /tmp/${APP_SLUG}-typing-<PANE_ID> (content:
 * "<tab>\n<unix-seconds>") at zle-line-init and remove it at zle-line-finish.
 * Files older than 60 s are ignored to handle unclean exits.
 */
export function isUserTypingInTab(tab: string): boolean {
  try {
    const files = (fs.readdirSync("/tmp") as string[]).filter((f) => f.startsWith(TYPING_FILE_PREFIX));
    const now = Math.floor(Date.now() / 1000);
    for (const file of files) {
      try {
        const lines = fs.readFileSync(`/tmp/${file}`, "utf8").trim().split("\n");
        const tabName = lines[0]?.trim() ?? "";
        const ts = parseInt(lines[1]?.trim() ?? "0", 10);
        if (tabName.toLowerCase() === tab.toLowerCase() && now - ts < 60) return true;
      } catch { /* file deleted between readdir and readFile */ }
    }
  } catch { /* /tmp unavailable */ }
  return false;
}

// ── Focus-dance helpers ──────────────────────────────────────────────────────
// Every "do something to a non-focused tab" operation in Zellij (write,
// write-chars, dump-screen) requires the same dance: switch to the tab,
// wait for focus, do the thing, switch back. Pre-extraction this was
// triplicated across sendRawKey / injectIntoTab / peekTab with copy-pasted
// `session ? \`zellij --session X action …\` : \`zellij action …\`` ternaries
// — 8 occurrences of the same branch. Two helpers below collapse it.

/** Build a zellij command string for an action call, with or without the
 *  --session flag. `args` is the action sub-command and its arguments,
 *  pre-escaped where needed (write-chars takes -- to stop option parsing,
 *  which the caller is responsible for placing). */
function zellijCmd(session: string | null, ...args: string[]): string {
  const prefix = session
    ? `zellij --session ${shellEscape(session)} action`
    : `zellij action`;
  return `${prefix} ${args.join(" ")}`;
}

/** Switch focus to `tab`, run `fn`, then restore the previously focused
 *  tab. The `fn` callback gets the resolved session (null if no multi-
 *  session) so it can build further commands via zellijCmd(session, …).
 *
 *  Throws if the focus switch doesn't land within 1s — better to fail
 *  loudly than to fire write-chars into whatever the user was actively
 *  typing in. The restore is best-effort; if it fails, the user's view
 *  is changed but the agent action already succeeded. */
function withFocusedTab<T>(tab: string, fn: (session: string | null) => T): T {
  const session = findSessionForTab(tab);
  const originalTab = getCurrentTab(session);
  execSync(zellijCmd(session, "go-to-tab-name", shellEscape(tab)));
  if (!waitForTabFocus(tab, 1000, session)) {
    throw new Error(`withFocusedTab: zellij tab "${tab}" did not gain focus within 1s — is the tab open and zellij reachable?`);
  }
  try {
    return fn(session);
  } finally {
    if (originalTab && originalTab.toLowerCase() !== tab.toLowerCase()) {
      try { execSync(zellijCmd(session, "go-to-tab-name", shellEscape(originalTab))); } catch { /* best effort */ }
    }
  }
}

/**
 * Send a raw key code (e.g. 3 = Ctrl+C, 13 = Enter) to a tab without writing
 * any characters first. Use for interrupt signals where write-chars would be wrong.
 */
export function sendRawKey(tab: string, keyCode: number): void {
  withFocusedTab(tab, (session) => {
    execSync(zellijCmd(session, "write", String(keyCode)));
  });
}

export function injectIntoTab(tab: string, prompt: string): void {
  // Capture where the user currently is so we can restore it after injection.
  // Zellij has no "write to unfocused pane" command — we must switch tabs to inject.
  // Switching back immediately keeps the disruption to a sub-200ms flash.
  withFocusedTab(tab, (session) => {
    // Use -- to stop option parsing in case the prompt text starts with a dash.
    execSync(zellijCmd(session, "write-chars", "--", shellEscape(prompt)));
    execSync("sleep 0.1");
    execSync(zellijCmd(session, "write", "13"));
  });
}

/**
 * Capture a snapshot of what's visible in a Zellij tab right now.
 *
 * Uses the same focus-dance pattern as injectIntoTab: switch to the target tab,
 * run `zellij action dump-screen <path>` (which only ever dumps the focused
 * pane), then switch back. The whole round-trip is sub-200ms on a healthy
 * Zellij, so the user sees a brief flash at most — same disruption budget as
 * a prompt injection, which they've already accepted as the cost of remote
 * dispatch.
 *
 * Why this exists: pre-peek, FleetCrown's /control view of a Zellij tab was
 * "name + last-known status chip." The user couldn't see what their agent was
 * actually saying without alt-tabbing into Zellij. Peek closes that gap — one
 * click → exact screen contents (output, prompts, errors) — making /control
 * the source of truth for fleet state instead of one of two surfaces the user
 * has to context-switch between.
 *
 * Returns the screen content as a string (ANSI sequences stripped). Throws on
 * focus failure or dump-screen error so the caller (IPC handler) can surface
 * a meaningful message instead of returning empty content that reads as
 * "tab is blank" to the user.
 */
export function peekTab(tab: string): string {
  // os.tmpdir() picks the platform-appropriate temp dir: /tmp on Linux/mac,
  // %TEMP% on Windows. Hardcoding /tmp would break the Windows desktop build
  // (the release pipeline ships .exe binaries, so this matters).
  const tmpFile = join(tmpdir(), `fc-peek-${process.pid}-${Date.now()}.txt`);
  let content = "";
  let dumpErr: Error | null = null;
  withFocusedTab(tab, (session) => {
    try {
      execSync(zellijCmd(session, "dump-screen", shellEscape(tmpFile)));
      // Brief wait — dump-screen returns before the file is fully flushed on
      // some zellij builds. 60ms covers the observed window without making
      // the round-trip feel laggy.
      execSync("sleep 0.06");
      content = stripAnsi(fs.readFileSync(tmpFile, "utf8"));
    } catch (e) {
      dumpErr = e as Error;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* best effort */ }
    }
  });

  if (dumpErr) throw dumpErr;
  return content;
}
