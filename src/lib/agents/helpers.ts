/**
 * Shared helpers for agent adapters.
 *
 * Each adapter is free to do its own thing, but these utilities are
 * the common building blocks: "is this command on PATH", "read a TOML
 * field", "dedupe a string list". Centralized so an adapter that
 * forgets to handle a malformed config doesn't crash the whole
 * /control page render.
 */

import fs from "fs";
import { existsSync } from "fs";

/** Does `command` exist as an executable file on the user's $PATH? */
export function commandExistsInPath(command: string): boolean {
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(":")) {
    if (!dir) continue;
    const candidate = `${dir}/${command}`;
    try {
      if (existsSync(candidate) && fs.statSync(candidate).mode & 0o111) {
        return true;
      }
    } catch {
      // Ignore malformed path entries.
    }
  }
  return false;
}

/** Parse a top-level TOML string field. Tolerant of comments and surrounding
 *  whitespace; fails closed (returns null) on anything weird so the adapter
 *  falls back to its hard-coded defaultModel. */
export function parseTomlStringField(raw: string, key: string): string | null {
  const match = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"\\n]+)"`, "m"));
  return match?.[1]?.trim() || null;
}

/** Drop empty strings + dedupe while preserving first-seen order. */
export function dedupeStrings(values: string[]): string[] {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}
