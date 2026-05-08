import { exec, execSync } from "child_process";
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

export function injectIntoTab(tab: string, prompt: string): void {
  // shellEscape both arguments — go-to-tab-name is case-sensitive and the tab
  // name may contain spaces or quotes that would break unescaped interpolation
  execSync(`zellij action go-to-tab-name ${shellEscape(tab)}`);
  execSync("sleep 0.3");
  execSync(`zellij action write-chars ${shellEscape(prompt)}`);
  execSync("sleep 0.1");
  execSync("zellij action write 13");
}
