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
import path from "path";
import { existsSync } from "fs";
import { HOME } from "@/lib/constants";

function candidatePathDirs(): string[] {
  const dirs = (process.env.PATH ?? "").split(":").filter(Boolean);
  const userDirs = [
    path.join(HOME, ".local", "bin"),
    path.join(HOME, ".npm-global", "bin"),
    path.join(HOME, ".bun", "bin"),
    path.join(HOME, ".deno", "bin"),
    path.join(HOME, ".cargo", "bin"),
    path.join(HOME, ".opencode", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ];

  const nvmVersionsDir = path.join(HOME, ".nvm", "versions", "node");
  try {
    for (const version of fs.readdirSync(nvmVersionsDir)) {
      userDirs.push(path.join(nvmVersionsDir, version, "bin"));
    }
  } catch {
    // nvm is optional.
  }

  return [...new Set([...dirs, ...userDirs])];
}

/** Does `command` exist as an executable file on the user's $PATH? */
export function commandExistsInPath(command: string): boolean {
  for (const dir of candidatePathDirs()) {
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
