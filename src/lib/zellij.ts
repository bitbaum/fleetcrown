import fs from "fs";
import { exec, execSync, execFileSync } from "child_process";
import { promisify } from "util";
import { APP_SLUG } from "@/config/brand";

// Filename prefix the zsh typing hooks write to /tmp. Must match
// scripts/install-cockpit-hooks.sh (which generates the hooks) — derived
// from APP_SLUG so a rename flips both sides together.
const TYPING_FILE_PREFIX = `${APP_SLUG}-typing-`;

const execAsync = promisify(exec);

/** Single-quote-escape a value for safe interpolation into a bash command string. */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Query Zellij for currently open tab names. Returns [] if Zellij is unavailable. */
export async function getZellijTabs(): Promise<string[]> {
  try {
    const { stdout } = await execAsync("zellij action query-tab-names 2>/dev/null || true", { timeout: 2000 });
    // Strip ANSI escape sequences (present when called outside an active pane context).
    // Also drop lines that look like session-list entries ("name [Created Xs ago]") which
    // query-tab-names emits when ZELLIJ_SESSION_NAME points to a stale/wrong session.
    const ansiRe = /\x1b\[[0-9;]*m/g;
    return stdout
      .split("\n")
      .map((s) => s.replace(ansiRe, "").trim())
      .filter((s) => s.length > 0 && !s.includes("[Created "));
  } catch {
    return [];
  }
}

const DUMP_CMD = `zellij action dump-layout 2>/dev/null | grep 'focus=true' | grep 'tab name=' | sed 's/.*tab name="\\([^"]*\\)".*/\\1/' | head -1`;

/** Return the name of the currently focused Zellij tab, or null if unavailable. */
function getCurrentTab(): string | null {
  try {
    const result = execFileSync("bash", ["-c", DUMP_CMD], { timeout: 2000 }).toString().trim();
    return result || null;
  } catch {
    return null;
  }
}

/** Poll dump-layout until the named tab has focus, up to maxWaitMs. */
function waitForTabFocus(tab: string, maxWaitMs = 1000): void {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const active = execFileSync("bash", ["-c", DUMP_CMD], { timeout: 2000 }).toString().trim();
      if (active === tab) return;
    } catch { /* dump-layout unavailable or parse failed — fall through */ }
    execSync("sleep 0.05");
  }
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

/**
 * Send a raw key code (e.g. 3 = Ctrl+C, 13 = Enter) to a tab without writing
 * any characters first. Use for interrupt signals where write-chars would be wrong.
 */
export function sendRawKey(tab: string, keyCode: number): void {
  const originalTab = getCurrentTab();
  execSync(`zellij action go-to-tab-name ${shellEscape(tab)}`);
  waitForTabFocus(tab);
  execSync(`zellij action write ${keyCode}`);
  if (originalTab && originalTab.toLowerCase() !== tab.toLowerCase()) {
    try { execSync(`zellij action go-to-tab-name ${shellEscape(originalTab)}`); } catch { /* best effort */ }
  }
}

export function injectIntoTab(tab: string, prompt: string): void {
  // Capture where the user currently is so we can restore it after injection.
  // Zellij has no "write to unfocused pane" command — we must switch tabs to inject.
  // Switching back immediately keeps the disruption to a sub-200ms flash.
  const originalTab = getCurrentTab();

  // go-to-tab-name is fire-and-forget; confirm the switch landed before
  // sending characters so write-chars never types into the wrong pane.
  execSync(`zellij action go-to-tab-name ${shellEscape(tab)}`);
  waitForTabFocus(tab);
  execSync(`zellij action write-chars ${shellEscape(prompt)}`);
  execSync("sleep 0.1");
  execSync("zellij action write 13");

  // Restore original tab so the user's terminal view doesn't permanently change.
  if (originalTab && originalTab.toLowerCase() !== tab.toLowerCase()) {
    try { execSync(`zellij action go-to-tab-name ${shellEscape(originalTab)}`); } catch { /* best effort */ }
  }
}
