import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runnerPresence } from "@/db/schema/runner-presence";
import { runtimeSnapshots } from "@/db/schema/runtime-snapshots";
import type { BuilderChannelPresence, ChannelHeartbeat } from "@/lib/builder-presence";
import { applyHeartbeatExpiry, inferBuilderChannelPresence } from "@/lib/builder-presence";

/**
 * Is any builder connected for this user? Connection-based presence —
 * written by the bridge on SSE connect/disconnect, not a heartbeat.
 */
export async function getRunnerConnected(userId: string): Promise<boolean> {
  const presence = await getBuilderPresence(userId);
  return presence.any;
}

/**
 * Cloud vs local builder channels (A4). Falls back when migration not applied yet.
 *
 * The connection flags alone are NOT the answer — they never expire (see
 * `applyHeartbeatExpiry`). Callers that already loaded the user's runtime
 * snapshots should pass them as `heartbeats` to avoid a second read.
 */
export async function getBuilderPresence(
  userId: string,
  runnerVersion?: string | null,
  heartbeats?: ChannelHeartbeat[],
): Promise<BuilderChannelPresence> {
  const [connection, beats] = await Promise.all([
    readConnectionFlags(userId, runnerVersion),
    heartbeats ? Promise.resolve(heartbeats) : readChannelHeartbeats(userId),
  ]);
  return applyHeartbeatExpiry(connection, beats);
}

/** Raw connect/disconnect bookkeeping — a claim with no expiry on its own. */
async function readConnectionFlags(
  userId: string,
  runnerVersion?: string | null,
): Promise<BuilderChannelPresence> {
  try {
    const rows = await db
      .select({
        connected: runnerPresence.connected,
        cloudConnected: runnerPresence.cloudConnected,
        localConnected: runnerPresence.localConnected,
      })
      .from(runnerPresence)
      .where(eq(runnerPresence.userId, userId))
      .limit(1);
    const row = rows[0];
    return inferBuilderChannelPresence({
      connected: row?.connected ?? false,
      cloudConnected: row?.cloudConnected,
      localConnected: row?.localConnected,
      runnerVersion,
    });
  } catch {
    const rows = await db
      .select({ connected: runnerPresence.connected })
      .from(runnerPresence)
      .where(eq(runnerPresence.userId, userId))
      .limit(1);
    return inferBuilderChannelPresence({
      connected: rows[0]?.connected ?? false,
      runnerVersion,
    });
  }
}

/** Last heartbeat per channel. A read failure must not invent liveness. */
async function readChannelHeartbeats(userId: string): Promise<ChannelHeartbeat[]> {
  try {
    return await db
      .select({ channel: runtimeSnapshots.channel, observedAt: runtimeSnapshots.observedAt })
      .from(runtimeSnapshots)
      .where(eq(runtimeSnapshots.userId, userId));
  } catch {
    return [];
  }
}

/**
 * Mark presence for a HOSTED runner (Hermes Phase 0 path without bridge SSE).
 * Box-runner should use bridge channel=cloud instead.
 *
 * NOT ENOUGH ON ITS OWN as of the heartbeat-expiry change: `getBuilderPresence`
 * now requires a fresh `runtime_snapshots` row for the channel, and this path
 * writes none — so a hosted runner alone reads offline. Deliberate, and today
 * inert (fleetcrown-hosted-runner.service is inactive; the box-runner supplies
 * the cloud channel's heartbeat). Before running the hosted runner as the sole
 * cloud executor it needs its OWN channel — it cannot heartbeat into the
 * "cloud" snapshot row, because that row belongs to the box-runner and a
 * shared row is last-writer-wins (the two-writers-one-row bug from #263).
 */
export async function setRunnerConnected(userId: string, connected: boolean): Promise<void> {
  const now = new Date();
  await db
    .insert(runnerPresence)
    .values({
      userId,
      connected,
      connectionCount: connected ? 1 : 0,
      cloudConnected: connected,
      cloudConnectionCount: connected ? 1 : 0,
      connectedAt: connected ? now : null,
      lastChangeAt: now,
    })
    .onConflictDoUpdate({
      target: runnerPresence.userId,
      set: {
        connected,
        connectionCount: connected ? 1 : 0,
        cloudConnected: connected,
        cloudConnectionCount: connected ? 1 : 0,
        lastChangeAt: now,
        ...(connected ? { connectedAt: now } : {}),
      },
    });
}
