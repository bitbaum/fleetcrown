/**
 * Typed command executor — the boundary between "what to do" and "how to do it."
 *
 * Local runtime:  commands fire directly into zellij via injectIntoTab().
 * Remote (cloud host): commands write to pending_commands in Postgres; the local runner picks them up.
 *
 * Callers express intent once. The executor routes to the correct mechanism.
 */

import { isRuntimeAvailable } from "@/lib/runtime";
import { enqueueInjectCommand } from "@/db/queries/pending-commands";
import { getRunnerConnected } from "@/db/queries/runner-presence";
import type { InjectPayload } from "@/db/schema/pending-commands";

export type ExecuteResult =
  | { ok: true;  mode: "direct" }
  // `runnerConnected` tells the caller whether a live Fleet Runner exists to
  // drain this queued command. false = it will sit in pending_commands until a
  // runner reconnects. Callers MUST surface that so a dispatch to an offline
  // runner is never a silent success (the "queued into the void" bug).
  | { ok: true;  mode: "queued"; commandId: string; runnerConnected: boolean }
  | { ok: false; mode: "direct" | "queued"; error: string };

/**
 * Execute a prompt injection.
 *
 * Local:  calls `injectFn` immediately (avoids importing child_process at module level
 *         so the route stays importable on the cloud host even though injectIntoTab calls execSync).
 * Remote: writes to pending_commands and returns the queued command ID.
 */
export async function executeInject(
  payload: InjectPayload,
  userId: string,
  injectFn: () => Promise<void>,
): Promise<ExecuteResult> {
  // Direct injection requires a local runtime (zellij + agents on this machine).
  // It does NOT require this process to live inside a Zellij pane: the terminal
  // adapter resolves the hosting session via findSessionForTab and qualifies
  // every command with `--session <name>`, so injectIntoTab works from any
  // local process (systemd service, CLI, etc.). The old ZELLIJ_SESSION_NAME
  // guard predated that adapter and forced queuing for the runner even when
  // direct injection would succeed — which silently broke project-card sends
  // on the systemd standalone server (RUNTIME_AVAILABLE=true, no pane env).
  // /api/control/tab-inject already gates on isRuntimeAvailable() alone; this
  // keeps the two inject paths consistent (one SSOT for "inject into a tab").
  // On the cloud host isRuntimeAvailable() is false, so remote still queues for the runner.
  if (isRuntimeAvailable()) {
    try {
      await injectFn();
      return { ok: true, mode: "direct" };
    } catch (err) {
      return { ok: false, mode: "direct", error: err instanceof Error ? err.message : String(err) };
    }
  }

  try {
    // Check presence BEFORE enqueue so we can tell the caller whether anything
    // is actually listening. We still enqueue when offline (so the work runs
    // once a runner reconnects), but we never report it as a clean success.
    const runnerConnected = await getRunnerConnected(userId);
    const commandId = await enqueueInjectCommand(userId, payload);
    return { ok: true, mode: "queued", commandId, runnerConnected };
  } catch (err) {
    return { ok: false, mode: "queued", error: err instanceof Error ? err.message : String(err) };
  }
}
