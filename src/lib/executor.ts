/**
 * Typed command executor — the boundary between "what to do" and "how to do it."
 *
 * Local runtime:  commands fire directly into zellij via injectIntoTab().
 * Remote (Vercel): commands write to pending_commands in Neon; the local runner picks them up.
 *
 * Callers express intent once. The executor routes to the correct mechanism.
 */

import { isRuntimeAvailable } from "@/lib/runtime";
import { enqueueInjectCommand } from "@/db/queries/pending-commands";
import type { InjectPayload } from "@/db/schema/pending-commands";

export type ExecuteResult =
  | { ok: true;  mode: "direct" }
  | { ok: true;  mode: "queued"; commandId: string }
  | { ok: false; mode: "direct" | "queued"; error: string };

/**
 * Execute a prompt injection.
 *
 * Local:  calls `injectFn` immediately (avoids importing child_process at module level
 *         so the route stays importable on Vercel even though injectIntoTab calls execSync).
 * Remote: writes to pending_commands and returns the queued command ID.
 */
export async function executeInject(
  payload: InjectPayload,
  userId: string,
  injectFn: () => Promise<void>,
): Promise<ExecuteResult> {
  // Direct injection requires both filesystem access AND a Zellij session in this process.
  // The production standalone server runs outside Zellij; the local runner (which IS inside
  // a Zellij pane) picks up queued commands and injects with the correct session context.
  if (isRuntimeAvailable() && !!process.env.ZELLIJ_SESSION_NAME) {
    try {
      await injectFn();
      return { ok: true, mode: "direct" };
    } catch (err) {
      return { ok: false, mode: "direct", error: err instanceof Error ? err.message : String(err) };
    }
  }

  try {
    const commandId = await enqueueInjectCommand(userId, payload);
    return { ok: true, mode: "queued", commandId };
  } catch (err) {
    return { ok: false, mode: "queued", error: err instanceof Error ? err.message : String(err) };
  }
}
