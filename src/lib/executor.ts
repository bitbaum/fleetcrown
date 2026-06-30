/**
 * Typed command executor — the boundary between "what to do" and "how to do it."
 *
 * Local runtime:  commands fire directly into zellij via injectIntoTab().
 * Remote (cloud host): commands write to pending_commands in Postgres; the local runner picks them up.
 *
 * Callers express intent once. The executor routes to the correct mechanism.
 */

import { isRuntimeAvailable } from "@/lib/runtime";
import { DEFAULT_ADAPTER_ID } from "@/lib/orchestration";
import { enqueueInjectCommand, enqueueDispatchCommand } from "@/db/queries/pending-commands";
import type { InjectPayload } from "@/db/schema/pending-commands";
import { resolveQueuedExecution } from "@/lib/execution-access";

export type ExecuteResult =
  | { ok: true;  mode: "direct" }
  // `runnerConnected` tells the caller whether a live Fleet Runner exists to
  // drain this queued command. false = it will sit in pending_commands until a
  // runner reconnects. Callers MUST surface that so a dispatch to an offline
  // runner is never a silent success (the "queued into the void" bug).
  | { ok: true;  mode: "queued"; commandId: string; runnerConnected: boolean }
  | { ok: false; mode: "direct" | "queued"; error: string; code?: string };

/**
 * Execute a prompt injection.
 *
 * Local:  calls `injectFn` immediately (avoids importing child_process at module level
 *         so the route stays importable on the cloud host even though injectIntoTab calls execSync).
 * Remote: writes to pending_commands and returns the queued command ID.
 */
export async function executeInject(
  payload: InjectPayload & {
    /** Local project dir. When present on the remote path, we enqueue a
     *  `dispatch` command (ensure tab + launch agent if none + inject) instead
     *  of a bare `inject` — so the prompt lands even when no agent is running
     *  yet. Without a dir we can't launch, so fall back to `inject`. */
    dir?: string | null;
    /** When true (a busy local project), skip the direct inject and queue for
     *  the runner instead — so a 2nd same-project dispatch serializes behind the
     *  running agent rather than colliding in the shared tab/PTY/checkout. The
     *  runner claims it once the project frees (claimNextPendingCommand gates on
     *  the open run). */
    projectBusy?: boolean;
  },
  userId: string,
  injectFn: () => Promise<void>,
): Promise<ExecuteResult> {
  const runtimeAvailable = isRuntimeAvailable();
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
  // `projectBusy` forces the queue path locally too: a 2nd same-project dispatch
  // serializes behind the running agent instead of colliding in the shared PTY.
  if (runtimeAvailable && !payload.projectBusy) {
    try {
      await injectFn();
      return { ok: true, mode: "direct" };
    } catch (err) {
      return { ok: false, mode: "direct", error: err instanceof Error ? err.message : String(err) };
    }
  }

  try {
    const remoteDefaultChannel = runtimeAvailable ? undefined : "cloud";
    const decision = await resolveQueuedExecution(userId, {
      requestedChannel: payload.channel,
      defaultChannel: remoteDefaultChannel,
    });
    if (!decision.ok) {
      return { ok: false, mode: "queued", error: decision.message, code: decision.code };
    }
    const channel = decision.channel;
    const commandId = payload.dir
      ? await enqueueDispatchCommand(userId, {
          tab: payload.tab,
          ...(channel ? { channel } : {}),
          dir: payload.dir,
          agent: payload.adapter ?? DEFAULT_ADAPTER_ID,
          prompt: payload.prompt,
          model: payload.model,
          promptKey: payload.promptKey,
          promptLabel: payload.promptLabel,
          projectKey: payload.projectKey,
          runId: payload.runId,
        })
      : await enqueueInjectCommand(userId, channel ? { ...payload, channel } : payload);
    return { ok: true, mode: "queued", commandId, runnerConnected: decision.runnerConnected };
  } catch (err) {
    return { ok: false, mode: "queued", error: err instanceof Error ? err.message : String(err) };
  }
}
