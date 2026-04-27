/**
 * Shared helpers for reading Claude's local configuration files.
 * SSOT for all path constants and file-reading logic used by the
 * /api/control and /api/inject routes.
 */
import fs from "fs";
import path from "path";

export const CLAUDE_HOME = process.env.HOME ?? "/home/g";
export const PROJECTS_CONF = path.join(CLAUDE_HOME, ".config", "claude-projects.conf");
export const PROMPTS_FILE  = path.join(CLAUDE_HOME, ".config", "claude-prompts.json");
export const META_FILE     = path.join(CLAUDE_HOME, ".config", "claude-prompts-meta.json");
export const SESSIONS_DIR  = path.join(CLAUDE_HOME, ".claude", "sessions");

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptMeta = {
  key: string;
  slot: number;
  icon: string;
  label: string;
  style: string;
  category: string;
};

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse claude-projects.conf → ordered array of { tab, dir } entries.
 * Deduplicates by tab name (case-insensitive, first occurrence wins).
 */
export function parseProjectsConf(): { tab: string; dir: string }[] {
  if (!fs.existsSync(PROJECTS_CONF)) return [];
  const seen = new Set<string>();
  const result: { tab: string; dir: string }[] = [];
  for (const line of fs.readFileSync(PROJECTS_CONF, "utf-8").split("\n")) {
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

export function readPromptMeta(): PromptMeta[] {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf-8")) as PromptMeta[];
  } catch {
    return [];
  }
}

export function readPrompts(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(PROMPTS_FILE, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Wrap a base prompt with session context from the project's session file.
 * If the session file exists, appends it + update instruction.
 * If not, asks Claude to create it with the standard fields.
 */
export function buildPromptWithSession(base: string, tab: string): string {
  const sessionFile = path.join(SESSIONS_DIR, `${tab}.md`);
  try {
    if (fs.existsSync(sessionFile)) {
      const session = fs.readFileSync(sessionFile, "utf-8");
      return `${base}\n\nSession state from last run:\n${session}\n\nUpdate ${sessionFile} when done: what you completed and what remains.`;
    }
  } catch { /* fall through */ }
  return `${base}\n\nBefore stopping, create ${sessionFile} with these lines: "done: <what you completed>", "next: <what remains>", "tests: <status>", "todos: <count>", "health: <good|degraded|critical>".`;
}
