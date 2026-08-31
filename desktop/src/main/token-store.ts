/**
 * Fleet Runner agent-token store — SSOT.
 *
 * The Bearer token Fleet Runner uses to authenticate against the FleetCrown
 * control plane lives in a single file on disk:
 *   ~/.config/fleetcrown/fleet-runner-token
 *
 * Pre-2026-06-06 that path + the read-and-trim load logic were copy-pasted in
 * three places: `poller.ts` (drains pending_commands), `pusher.ts` (heartbeat
 * + zellij-tab push), and `index.ts` (manual paste, deep-link auth, IPC
 * save/load/clear). A typo in one wouldn't break the others, but a real
 * rotation or rename would silently leave one of them on the stale path,
 * producing baffling "I rotated the token, why is the daemon still using
 * the old one" bugs.
 *
 * This module is the only thing that touches the path. The three callers
 * now import `loadToken`/`saveToken`/`clearToken`/`tokenPath` from here.
 * If we ever move the file (different OS conventions, multi-account
 * support), it's a one-file change.
 *
 * The trim-on-load is load-bearing: users paste tokens from the web UI's
 * clipboard helper, which sometimes appends a trailing newline. Without
 * the trim, `Authorization: Bearer ck_…\n` is sent and the cloud's request
 * parser silently rejects it as malformed.
 */

import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";

const CONFIG_DIR = join(homedir(), ".config", "fleetcrown");
const TOKEN_FILE = join(CONFIG_DIR, "fleet-runner-token");

/** Absolute path to the token file — exposed for IPC `get-config-dir` etc. */
export const tokenPath = TOKEN_FILE;

/** Directory holding the token file. Exposed so the renderer can show
 *  "Saved to <path>" hints without re-deriving it. */
export const tokenDir = CONFIG_DIR;

/** Read the saved token, or null when no token is saved. Trims whitespace
 *  (notably trailing newlines from clipboard-pasted values) so callers can
 *  inline it into `Bearer …` headers without worrying about line endings. */
export function loadToken(): string | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const t = readFileSync(TOKEN_FILE, "utf8").trim();
    return t || null;
  } catch {
    return null;
  }
}

/** Persist `token` to disk, creating the parent directory if it doesn't
 *  exist. Returns a discriminated result so callers can surface fs failures
 *  (read-only home, quota, etc.) without throwing across the IPC bridge. */
export function saveToken(token: string): { ok: true } | { ok: false; error: string } {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(TOKEN_FILE, token.trim(), "utf8");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** True when a non-default control-plane URL is in effect (FLEETCROWN_WEB_URL
 *  set — dev, preview, or a localhost build). The token file is SHARED across
 *  every Fleet Runner instance on this machine, including the user's real
 *  production app. A 401 from a dev/preview server only means "this token isn't
 *  valid against THIS server" — it says nothing about the real server. So a
 *  dev/test instance must NEVER clearToken() on 401, or it silently logs out
 *  the production runner that shares this file. The default-URL (production)
 *  build still clears, so its auto-mint recovery path is unchanged. */
export function isDevBaseOverride(): boolean {
  return !!(process.env.FLEETCROWN_WEB_URL || "").trim();
}

/** Delete the saved token. No-ops when the file is already absent, so it's
 *  safe to call from "Disconnect this Fleet Runner" buttons without
 *  guarding for state. */
export function clearToken(): { ok: true } | { ok: false; error: string } {
  try {
    if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
