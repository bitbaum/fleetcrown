/**
 * Shared helpers for reading Claude's local configuration files.
 * SSOT for all path constants and file-reading logic used by the
 * /api/control and /api/inject routes.
 *
 * STATE FILE CONTRACT
 * ───────────────────
 * Cockpit (inject/control routes) and dotfiles (stop.sh, notification.sh)
 * communicate exclusively through these /tmp sentinel files.
 * The bash scripts duplicate the names as string literals — keep in sync.
 *
 *   claude-ready-<TAB>            Normal stop: Claude finished a turn, popup shown
 *   claude-closing-<TAB>          close_session prompt is currently running
 *   claude-closed-<TAB>           close_session finished (stop.sh consumed sentinel)
 *   claude-session-closed-<TAB>   Sentinel: close_session was chosen; stop.sh consumes this
 *   claude-current-prompt-<TAB>   JSON: { key, label, startedAt } of running prompt
 *   claude-stop-active-<TAB>      Lock: stop-hook popup is open; notification.sh must wait
 */
import fs from "fs";
import path from "path";

export const CLAUDE_HOME = process.env.HOME ?? "/home/g";
export const PROJECTS_CONF = process.env.AGENT_PROJECTS_CONF ?? path.join(/*turbopackIgnore: true*/ CLAUDE_HOME, ".config", "agent-projects.conf");
export const CLAUDE_PROJECTS_CONF = path.join(/*turbopackIgnore: true*/ CLAUDE_HOME, ".config", "claude-projects.conf");

export const PROMPTS_FILE  = process.env.AGENT_PROMPTS_FILE ?? path.join(/*turbopackIgnore: true*/ CLAUDE_HOME, ".config", "agent-prompts.json");
export const CLAUDE_PROMPTS_FILE  = path.join(/*turbopackIgnore: true*/ CLAUDE_HOME, ".config", "claude-prompts.json");

export const SESSIONS_DIR  = path.join(/*turbopackIgnore: true*/ CLAUDE_HOME, ".claude", "sessions");

// ── State file helpers ────────────────────────────────────────────────────────
// Single place where the /tmp/<name>-<tab> file names are defined for TypeScript.
// Bash scripts in ~/.claude/hooks/ duplicate these as string literals — if you
// rename any of these, update stop.sh and notification.sh to match.

export const stateFile = {
  ready:    (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `agent-ready-${tab}`),
  closing:  (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `agent-closing-${tab}`),
  closed:   (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `agent-closed-${tab}`),
  sentinel: (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `agent-session-closed-${tab}`),
  prompt:   (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `agent-current-prompt-${tab}`),
  lock:     (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `agent-stop-active-${tab}`),
  
  // Legacy names — kept for cleanup unlinkSync calls in inject + orchestration routes.
  // No new files are written with these names; only used to delete stale on-disk files.
  claudeReady:  (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `claude-ready-${tab}`),
  claudeClosed: (tab: string) => path.join("/tmp", /*turbopackIgnore: true*/ `claude-closed-${tab}`),
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptMeta = {
  key: string;
  slot: number | null;
  icon: string;
  label: string;
  style: string;
  category: string;
};

export type PromptConfig = PromptMeta & { prompt: string };

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse claude-projects.conf → ordered array of { tab, dir } entries.
 * Deduplicates by tab name (case-insensitive, first occurrence wins).
 */
export function parseProjectsConf(): { tab: string; dir: string }[] {
  let file = PROJECTS_CONF;
  if (!fs.existsSync(file)) {
    file = CLAUDE_PROJECTS_CONF;
  }
  if (!fs.existsSync(file)) return [];
  const seen = new Set<string>();
  const result: { tab: string; dir: string }[] = [];
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("|");
    if (parts.length < 2) continue;
    const tab = parts[0].trim();
    const dir = parts[1].trim();
    if (!seen.has(tab.toLowerCase())) {
      seen.add(tab.toLowerCase());
      result.push({ tab, dir });
    }
  }
  return result;
}

/**
 * Parse claude-projects.conf → Map<lowerCaseTabName, canonicalTabName>.
 * Used by the inject route to resolve a tab name to its exact-cased form.
 */
export function readProjectsMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const { tab } of parseProjectsConf()) {
    map.set(tab.toLowerCase(), tab);
  }
  return map;
}

/**
 * Given a canonical tab name and the currently active Zellij tab names,
 * return the live tab name to use for injection and /tmp sentinel files.
 *
 * IMPORTANT: always returns the EXACT casing from activeTabs (zellij's ground
 * truth), never from the conf file. `zellij action go-to-tab-name` is
 * case-sensitive — returning conf casing causes silent navigation failure and
 * write-chars lands on whichever tab is currently focused (wrong tab).
 */
export function resolveEffectiveTab(canonical: string, activeTabs: string[]): string {
  if (!activeTabs.length) return canonical;
  // Return exact zellij casing — case-insensitive match, exact-case return
  const findAlive = (name: string) => activeTabs.find((t) => t.toLowerCase() === name.toLowerCase());
  const liveMatch = findAlive(canonical);
  if (liveMatch) return liveMatch;
  // Canonical not open; try a conf alias pointing to the same directory
  const all = parseProjectsConf();
  const canonicalDir = all.find((p) => p.tab.toLowerCase() === canonical.toLowerCase())?.dir;
  if (!canonicalDir) return canonical;
  const aliasEntry = all.find((p) => p.dir === canonicalDir && findAlive(p.tab));
  return aliasEntry ? (findAlive(aliasEntry.tab) ?? canonical) : canonical;
}

/**
 * Read the unified claude-prompts.json (array format — SSOT for prompt text + metadata).
 */
export function readPromptConfig(): PromptConfig[] {
  try {
    let file = PROMPTS_FILE;
    if (!fs.existsSync(file)) {
      file = CLAUDE_PROMPTS_FILE;
    }
    return JSON.parse(fs.readFileSync(file, "utf-8")) as PromptConfig[];
  } catch {
    return [];
  }
}

/** Backward-compat: derive metadata array from unified config. */
export function readPromptMeta(): PromptMeta[] {
  return readPromptConfig();
}

/** Backward-compat: derive key→prompt dict from unified config. */
export function readPrompts(): Record<string, string> {
  return Object.fromEntries(readPromptConfig().map((p) => [p.key, p.prompt]));
}

/**
 * Wrap a base prompt with session context from the project's session file.
 * If the session file exists, appends it + update instruction.
 * If not, asks Claude to create it with the standard fields.
 */
export function buildPromptWithSession(base: string, tab: string): string {
  const sessionFile = path.join(SESSIONS_DIR, `${tab}.md`);
  const sessionUpdateBlock = [
    `When done, update ${sessionFile} with exactly these lines:`,
    "done: <one sentence what you completed>",
    "next: <one sentence what remains>",
    "tests: <N pass · N fail, or 'no suite'>",
    "todos: <count> TODOs",
    "health: <good | needs attention | critical>",
  ].join("\n");

  try {
    if (fs.existsSync(sessionFile)) {
      const session = fs.readFileSync(sessionFile, "utf-8");
      return `${base}

Session state from last run:
${session}

${sessionUpdateBlock}`;
    }
  } catch {
    /* fall through */
  }

  return `${base}

Before stopping, create ${sessionFile}.
${sessionUpdateBlock}`;
}
