import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runnerPresence } from "@/db/schema/runner-presence";

/**
 * Is the Fleet Runner connected for this user? Connection-based presence —
 * written by the bridge on SSE connect/disconnect, not a heartbeat. Returns
 * false when no row exists yet (pre-rollout / never connected).
 *
 * See docs/architecture/connection-presence.md.
 */
export async function getRunnerConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select({ connected: runnerPresence.connected })
    .from(runnerPresence)
    .where(eq(runnerPresence.userId, userId))
    .limit(1);
  return rows[0]?.connected ?? false;
}

/**
 * Mark presence for a HOSTED runner (the box-side worker), which has no bridge
 * SSE connection to flip the row. Upserts connected + timestamps so a project
 * stops showing fully dark when a hosted runner is available.
 *
 * Phase 0 simplification: presence is one boolean per user, shared with the
 * bridge's local-runner signal. With no local Fleet Runner connected (the
 * common "laptop asleep" case this exists for) the hosted runner is the only
 * writer, so this is clean. A hosted-vs-local presence distinction is a later
 * refinement. See docs/architecture/hosted-ephemeral-runner.md.
 */
export async function setRunnerConnected(userId: string, connected: boolean): Promise<void> {
  const now = new Date();
  await db
    .insert(runnerPresence)
    .values({
      userId,
      connected,
      connectionCount: connected ? 1 : 0,
      connectedAt: connected ? now : null,
      lastChangeAt: now,
    })
    .onConflictDoUpdate({
      target: runnerPresence.userId,
      set: {
        connected,
        connectionCount: connected ? 1 : 0,
        lastChangeAt: now,
        ...(connected ? { connectedAt: now } : {}),
      },
    });
}
