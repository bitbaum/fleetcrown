import { exec, execSync, execFileSync } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/** Single-quote-escape a value for safe interpolation into a bash command string. */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Query Zellij for currently open tab names. Returns [] if Zellij is unavailable. */
export async function getZellijTabs(): Promise<string[]> {
  try {
    const { stdout } = await execAsync("zellij action query-tab-names 2>/dev/null || true", { timeout: 2000 });
    return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
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
