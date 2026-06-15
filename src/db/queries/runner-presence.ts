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
