/**
 * Fleet Runner cold-start: bring zellij to a state where the user's fleet
 * is running, without the user ever opening a terminal.
 *
 * Why fresh-spawn-from-snapshot is the default:
 *   Agent CLIs (claude, codex, cursor, gemini, grok) persist their session
 *   state in their own files (~/.fleetcrown/sessions/<tab>.md, etc.). When we
 *   restart `claude` in the right cwd, it auto-resumes the conversation.
 *   Zellij's built-in resurrection ALSO captures the same (tab, command,
 *   cwd) tuple — but it adds a "Press ENTER to run" gate per pane that
 *   the user must manually clear. We lose nothing meaningful by skipping
 *   it. The single piece of zellij-only state we don't preserve is the
 *   visible scrollback in non-agent panes; the layout itself round-trips.
 *
 * The decision tree:
 *
 *   list-sessions sees target sessionName as LIVE
 *      → no-op, return 'already-running'.
 *   list-sessions sees it as EXITED (zellij would offer to resurrect)
 *      → if mode==='fresh-spawn': delete-session, generate KDL, spawn
 *      → if mode==='leave-alone': attach detached so the session exists
 *         but DON'T press Enter — preserves zellij's prompt for the user
 *         to confirm manually (legacy behavior, opt-in).
 *   nothing matches sessionName at all
 *      → generate KDL from snapshot, spawn `zellij --layout`.
 *
 * Failure modes are surfaced as BootstrapResult.ok=false with an error
 * string. The poller logs them and continues — queued commands flush once
 * zellij comes up by other means.
 */

import { execSync, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { zellijExecutableForShell, shellEscape, getZellijSessionsSync } from "@/lib/terminals/zellij";
import type { PaneRecord } from "@/db/schema/runtime-snapshots";
import { generateLayoutKdl } from "@/lib/zellij-layout-generator";

export type BootstrapMode = "fresh-spawn" | "leave-alone";

export type BootstrapResult =
  | { ok: true; mode: "already-running" | "fresh-spawn" | "leave-alone-noop"; sessionName: string }
  | { ok: false; sessionName: string; error: string };

export type EnsureOpts = {
  /**
   * fresh-spawn: discard any exited zellij session of the same name and
   * spawn fresh from our snapshot. RECOMMENDED.
   * leave-alone: don't touch zellij's serialized resurrect file. If the
   * session is exited, the user will see the press-Enter prompt next time
   * they attach manually.
   */
  mode: BootstrapMode;
};

const LAYOUT_PATH = path.join(os.homedir(), ".cache", "fleetcrown", "layout.kdl");

/** Parse `zellij list-sessions` (with formatting) for exited markers. */
function exitedSessionExists(sessionName: string): boolean {
  try {
    const out = execSync(`${zellijExecutableForShell()} list-sessions 2>/dev/null || true`, {
      encoding: "utf-8",
      timeout: 2000,
    });
    // Zellij formats lines roughly: "<name> [Created ...] (EXITED - <ts>)"
    // We just need a line that mentions our name and the EXITED token.
    const escapedName = sessionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escapedName}\\b.*EXITED`, "i").test(out);
  } catch {
    return false;
  }
}

function sessionIsLive(sessionName: string): boolean {
  return getZellijSessionsSync().some((s) => s.toLowerCase() === sessionName.toLowerCase());
}

function deleteSession(sessionName: string): void {
  try {
    execSync(`${zellijExecutableForShell()} delete-session ${shellEscape(sessionName)} 2>/dev/null || true`, {
      timeout: 3000,
    });
  } catch {
    // best effort; spawn step will catch anything pathological
  }
}

function writeLayoutFile(panes: PaneRecord[]): string {
  fs.mkdirSync(path.dirname(LAYOUT_PATH), { recursive: true });
  const kdl = generateLayoutKdl(panes);
  fs.writeFileSync(LAYOUT_PATH, kdl, "utf-8");
  return LAYOUT_PATH;
}

/**
 * Spawn `zellij --session X --layout Y` detached so the session keeps
 * running after this process detaches. Resolves once the session appears
 * in `list-sessions` (polled every 200ms) or after a 5s deadline.
 */
async function spawnDetachedAndWait(sessionName: string, layoutPath: string): Promise<boolean> {
  // We can't easily reuse zellijExecutableForShell() here because spawn()
  // doesn't go through a shell. Resolve once, pass argv directly.
  const resolveOnce = execSync("which zellij 2>/dev/null || true", { encoding: "utf-8" }).trim();
  const zellijBin = process.env.FLEETCROWN_ZELLIJ_BIN || resolveOnce || "zellij";

  const child = spawn(zellijBin, ["--session", sessionName, "--layout", layoutPath], {
    detached: true,
    stdio: "ignore",
    // Don't inherit a controlling TTY — this is a runner-spawned session.
    env: { ...process.env, ZELLIJ_SESSION_NAME: undefined as unknown as string },
  });
  child.unref();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (sessionIsLive(sessionName)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Make sure a zellij session named `sessionName` is running and contains
 * the panes described by `desiredPanes`. Idempotent: calling repeatedly
 * is safe; if the session is already alive, we no-op.
 */
export async function ensureZellijReady(
  sessionName: string,
  desiredPanes: PaneRecord[],
  opts: EnsureOpts,
): Promise<BootstrapResult> {
  try {
    // 1. Already running — done.
    if (sessionIsLive(sessionName)) {
      return { ok: true, mode: "already-running", sessionName };
    }

    // 2. Exited session present — handle per mode.
    if (exitedSessionExists(sessionName)) {
      if (opts.mode === "leave-alone") {
        return { ok: true, mode: "leave-alone-noop", sessionName };
      }
      deleteSession(sessionName);
    }

    // 3. Spawn fresh from our snapshot. Empty snapshot is still valid —
    // layout generator emits a single empty tab as a fallback.
    const layoutPath = writeLayoutFile(desiredPanes);
    const spawned = await spawnDetachedAndWait(sessionName, layoutPath);
    if (!spawned) {
      return {
        ok: false,
        sessionName,
        error: `zellij session "${sessionName}" did not appear within 5s after spawn`,
      };
    }
    return { ok: true, mode: "fresh-spawn", sessionName };
  } catch (err) {
    return {
      ok: false,
      sessionName,
      error: (err as Error).message || "unknown bootstrap error",
    };
  }
}
