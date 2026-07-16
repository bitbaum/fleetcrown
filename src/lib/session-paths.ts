import fs from "fs";
import os from "os";
import path from "path";

export const FLEET_SESSIONS_DISPLAY_PATH = "~/.fleetcrown/sessions";
export const LEGACY_CLAUDE_SESSIONS_DISPLAY_PATH = "~/.claude/sessions";

export function fleetSessionsDir(homeDir = os.homedir()): string {
  return process.env.APP_SESSIONS_DIR ?? path.join(homeDir, ".fleetcrown", "sessions");
}

export function legacyClaudeSessionsDir(homeDir = os.homedir()): string {
  return path.join(homeDir, ".claude", "sessions");
}

/**
 * Move FleetCrown-owned handoffs out of Claude's protected configuration tree.
 * Copy-only keeps rollback compatibility; existing destination files always win.
 */
export function migrateLegacyHandoffs(homeDir = os.homedir()): string {
  const destination = fleetSessionsDir(homeDir);
  const legacy = legacyClaudeSessionsDir(homeDir);
  fs.mkdirSync(destination, { recursive: true });
  if (path.resolve(destination) === path.resolve(legacy) || !fs.existsSync(legacy)) return destination;

  for (const name of fs.readdirSync(legacy)) {
    // Claude owns the live <pid>.json files. FleetCrown owns Markdown handoffs,
    // roadmaps, and blocker directories, so only those migrate.
    if (name.endsWith(".json")) continue;
    const from = path.join(legacy, name);
    const to = path.join(destination, name);
    if (fs.existsSync(to)) continue;
    fs.cpSync(from, to, { recursive: true, preserveTimestamps: true, errorOnExist: false });
  }
  return destination;
}
