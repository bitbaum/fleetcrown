/**
 * Zellij terminal adapter — the only impl that exists today.
 *
 * Implements `TerminalAdapter` against Zellij's `action ...` subcommand
 * surface. Every per-tab operation requires the "focus dance" — switch
 * to the target tab, do the action, switch back — because Zellij has
 * no "act on a non-focused pane" primitive. Sub-200ms total round-trip
 * on a healthy Zellij; the user sees a brief flash at most.
 *
 * Multi-session aware: many users run multiple Zellij sessions (e.g. one
 * per project area). `findSessionForTab` scans every active session,
 * matches case-insensitive on tab name, then qualifies the command with
 * `--session <name>` so the action lands in the right place even when
 * tab names collide across sessions.
 *
 * When Zellij isn't running at all: every method returns an empty result
 * or no-ops. No exceptions thrown. The pusher pushes `openTabs: []` to
 * the cloud; /control shows "No live workspace data" with the install
 * CTA. Honest degradation, not error spam.
 */

import fs from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { exec, execSync, execFileSync } from "child_process";
import { promisify } from "util";
import { APP_SLUG } from "@/config/brand";
import { stripAnsi } from "@/lib/ansi";
import { findMatchingTab } from "@/lib/tab-match";
import type { TerminalAdapter } from "./types";

const TYPING_FILE_PREFIX = `${APP_SLUG}-typing-`;
const execAsync = promisify(exec);

// Re-exported for callers that need to escape user values before
// interpolating into shell commands (agent launch commands, git-state
// queries, etc.). Lives in this module because it was originally written
// for zellij and the rename to a generic location can wait.
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveZellijExecutable(): string {
  const candidates = [
    process.env.FLEETCROWN_ZELLIJ_BIN,
    "/usr/local/bin/zellij",
    "/usr/bin/zellij",
    "/opt/homebrew/bin/zellij",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && (fs.statSync(candidate).mode & 0o111)) return candidate;
    } catch {
      // Ignore unreadable candidates.
    }
  }
  return "zellij";
}

/** Shell-escaped zellij executable. Prefer the user's installed binary over
 * the bundled fallback because an older bundled zellij may not see sessions
 * created by the user's newer terminal zellij. */
export function zellijExecutableForShell(): string {
  return shellEscape(resolveZellijExecutable());
}

function cleanZellijLines(stdout: string): string[] {
  return stripAnsi(stdout)
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.includes("[Created "));
}

export function getZellijSessionsSync(): string[] {
  try {
    const stdout = execSync(`${zellijExecutableForShell()} list-sessions --no-formatting 2>/dev/null`, {
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
    `${zellijExecutableForShell()} --session ${shellEscape(session)} action query-tab-names 2>/dev/null`,
    `ZELLIJ_SESSION_NAME=${shellEscape(session)} ${zellijExecutableForShell()} action query-tab-names 2>/dev/null`,
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

/** Find which Zellij session (if any) currently hosts a tab with the given name. */
function findSessionForTab(tab: string): string | null {
  const sessions = getZellijSessionsSync();
  for (const s of sessions) {
    if (findMatchingTab(tab, getTabsForSessionSync(s))) return s;
  }
  return null;
}

/** Query Zellij for currently open tab names. Returns [] if Zellij is unavailable. */
async function getTabsAsync(): Promise<string[]> {
  const sessions = getZellijSessionsSync();
  if (sessions.length > 0) {
    const tabs = sessions.flatMap(getTabsForSessionSync);
    if (tabs.length > 0) return [...new Set(tabs)];
  }
  try {
    const { stdout } = await execAsync(`${zellijExecutableForShell()} action query-tab-names 2>/dev/null || true`, { timeout: 2000 });
    return cleanZellijLines(stdout);
  } catch {
    return [];
  }
}

function buildDumpCmd(session: string | null): string {
  // Get the currently focused tab name from dump-layout. session-qualified
  // version when known, else fall back to the implicit one (which uses
  // ZELLIJ_SESSION_NAME if set, otherwise whatever session ran us).
  const sess = session ? `--session ${shellEscape(session)} ` : "";
  return `${zellijExecutableForShell()} ${sess}action dump-layout 2>/dev/null | grep 'focus=true' | grep 'tab name=' | sed 's/.*tab name="\\([^"]*\\)".*/\\1/' | head -1`;
}

function getCurrentTab(sessionHint: string | null = null): string | null {
  const cmd = buildDumpCmd(sessionHint);
  try {
    const result = execFileSync("bash", ["-c", cmd], { timeout: 2000 }).toString().trim();
    return result || null;
  } catch {
    return null;
  }
}

function waitForTabFocus(tab: string, maxWaitMs = 1000, session: string | null = null): boolean {
  const deadline = Date.now() + maxWaitMs;
  const cmd = buildDumpCmd(session);
  const target = tab.toLowerCase();
  while (Date.now() < deadline) {
    try {
      const active = execFileSync("bash", ["-c", cmd], { timeout: 2000 }).toString().trim();
      // Case-insensitive: zellij stores tabs with whatever case the user typed
      // when creating them (often PascalCase) while our DB / inject payload
      // may be lowercase. Strict equality used to silently fail the focus
      // confirmation 100% of dispatches when the cases drifted.
      if (active.toLowerCase() === target) return true;
    } catch { /* dump-layout unavailable or parse failed — fall through */ }
    execSync("sleep 0.05", { timeout: 1000 });
  }
  return false;
}

/** Return the live tab name (preserving zellij's casing) that case-insensitively
 *  matches `tab`, or null if no such tab exists. Used by withFocusedTab so
 *  subsequent zellij `action` commands address the tab by the name zellij
 *  actually knows. */
function resolveLiveTabName(session: string | null, tab: string): string | null {
  const candidates = session ? getTabsForSessionSync(session) : [];
  return findMatchingTab(tab, candidates);
}

/** Higher-order helper: switch focus to `tab`, run `fn`, restore original.
 *  Throws on focus failure within 1s. Looks up the live tab name from
 *  zellij so case mismatches between the DB and zellij are handled
 *  transparently — `go-to-tab-name "fleetcrown"` would silently no-op if
 *  zellij has the tab as "FleetCrown", causing the focus check to time out. */
/** Build a directive error string that names what we observed and the
 *  exact next step. Replaces generic "did not gain focus" / "is zellij
 *  reachable?" wording that left the user guessing what to do. */
function buildFocusError(tab: string, session: string | null, allSessions: string[]): string {
  // No zellij at all — surface the install/launch directive.
  if (allSessions.length === 0) {
    return `Cannot inject into "${tab}": no zellij session is running on the connected computer. Start zellij (or Fleet Runner, which manages it for you) and retry.`;
  }
  // Tab not found in any session — list what IS open so the user can see
  // the actual session/tab inventory and either rename or open the target.
  if (session === null) {
    const inventory = allSessions
      .map((s) => {
        const tabs = getTabsForSessionSync(s);
        return tabs.length ? `${s}: ${tabs.join(", ")}` : `${s}: (no tabs)`;
      })
      .join(" | ");
    return `Cannot inject into "${tab}": no zellij tab with that name in any active session. Open it (e.g. zellij action new-tab --name "${tab}") or rename an existing tab. Currently open — ${inventory}.`;
  }
  // Tab is known but focus didn't take. Most common cause: stale zellij
  // server state after a session detach/reattach, or the tab is locked
  // by a modal. Tell the user the exact remediation.
  return `Cannot inject into "${tab}": found in session "${session}" but focus did not take within 1s. Reattach (zellij attach ${session}) or restart the session, then retry.`;
}

function withFocusedTab<T>(tab: string, fn: (session: string | null) => T): T {
  const session = findSessionForTab(tab);
  const liveTab = resolveLiveTabName(session, tab) ?? tab;
  const originalTab = getCurrentTab(session);
  execSync(zellijCmd(session, "go-to-tab-name", shellEscape(liveTab)), { timeout: 2000 });
  if (!waitForTabFocus(liveTab, 1000, session)) {
    throw new Error(buildFocusError(tab, session, getZellijSessionsSync()));
  }
  try {
    return fn(session);
  } finally {
    if (originalTab && originalTab.toLowerCase() !== liveTab.toLowerCase()) {
      try { execSync(zellijCmd(session, "go-to-tab-name", shellEscape(originalTab)), { timeout: 2000 }); } catch { /* best effort */ }
    }
  }
}

function zellijCmd(session: string | null, ...args: string[]): string {
  const prefix = session ? `${zellijExecutableForShell()} --session ${shellEscape(session)} action` : `${zellijExecutableForShell()} action`;
  return `${prefix} ${args.join(" ")}`;
}

/** The Zellij implementation of TerminalAdapter. Exported so the
 *  index can register it and callers that need Zellij-specific behavior
 *  (rare — should be rare) can import directly. */
export const zellijAdapter: TerminalAdapter = {
  id: "zellij",
  label: "Zellij",

  detectAvailable(): boolean {
    return getZellijSessionsSync().length > 0;
  },

  listOpenTabs(): Promise<string[]> {
    return getTabsAsync();
  },

  getActiveTab(): string | null {
    return getCurrentTab(null);
  },

  focusTab(tab: string): void {
    const session = findSessionForTab(tab);
    const liveTab = resolveLiveTabName(session, tab) ?? tab;
    execSync(zellijCmd(session, "go-to-tab-name", shellEscape(liveTab)), { timeout: 2000 });
    if (!waitForTabFocus(liveTab, 1000, session)) {
      throw new Error(buildFocusError(tab, session, getZellijSessionsSync()));
    }
  },

  injectText(tab: string, text: string): void {
    withFocusedTab(tab, (session) => {
      execSync(zellijCmd(session, "write-chars", "--", shellEscape(text)), { timeout: 2000 });
      execSync("sleep 0.1", { timeout: 1000 });
      execSync(zellijCmd(session, "write", "13"), { timeout: 2000 });
    });
  },

  sendRawKey(tab: string, keyCode: number): void {
    withFocusedTab(tab, (session) => {
      execSync(zellijCmd(session, "write", String(keyCode)), { timeout: 2000 });
    });
  },

  dumpScreen(tab: string): string {
    const tmpFile = join(tmpdir(), `fc-peek-${process.pid}-${Date.now()}.txt`);
    let content = "";
    let dumpErr: Error | null = null;
    withFocusedTab(tab, (session) => {
      try {
        execSync(zellijCmd(session, "dump-screen", shellEscape(tmpFile)), { timeout: 2000 });
        // Brief wait — dump-screen returns before the file is fully flushed
        // on some zellij builds. 60ms covers the observed window.
        execSync("sleep 0.06", { timeout: 1000 });
        content = stripAnsi(fs.readFileSync(tmpFile, "utf8"));
      } catch (e) {
        dumpErr = e as Error;
      } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* best effort */ }
      }
    });
    if (dumpErr) throw dumpErr;
    return content;
  },

  /** True when /tmp/${APP_SLUG}-typing-<PANE_ID> file is fresh (<60s).
   *  ZSH hooks (scripts/install-cockpit-hooks.sh) write/delete these files
   *  on zle-line-init/zle-line-finish. Files older than 60s are ignored
   *  to handle unclean exits. */
  isUserTyping(tab: string): boolean {
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
  },
};
