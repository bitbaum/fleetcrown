import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runnerPresence } from "@/db/schema/runner-presence";
import { runtimeSnapshots } from "@/db/schema/runtime-snapshots";
import type { BuilderChannelPresence, ChannelHeartbeat, BuilderDurability } from "@/lib/builder-presence";
import { applyHeartbeatExpiry, inferBuilderChannelPresence, channelDurability } from "@/lib/builder-presence";

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
 * `applyHeartbeatExpiry`).
 *
 * Both reads happen HERE, at request time, and no caller may hand in
 * heartbeats it loaded earlier. An age is only meaningful against the clock it
 * is compared to: /api/control's slow cache has a 20s TTL but serves stale
 * while it refreshes in the background, so on an idle site the first request
 * gets a cache built minutes ago. Passing those timestamps in aged a live
 * runner past the offline threshold and reported a heartbeating builder as
 * offline — the same lie, in the other direction. Two small indexed reads on
 * two-row tables are cheaper than a false liveness claim.
 */
export async function getBuilderPresence(
  userId: string,
  runnerVersion?: string | null,
): Promise<BuilderChannelPresence> {
  return (await getBuilderFitness(userId, runnerVersion)).presence;
}

/**
 * Presence AND durability from the same two reads.
 *
 * Both answers come out of the same heartbeat rows, so taking them separately
 * would mean reading those rows twice and — worse — comparing them against two
 * different `now`s. The comment on getBuilderPresence explains why that matters:
 * an age is only meaningful against the clock it is measured with, and this
 * subsystem has already shipped one bug where a liveness answer was computed
 * from timestamps loaded at a different moment.
 */
export async function getBuilderFitness(
  userId: string,
  runnerVersion?: string | null,
): Promise<{ presence: BuilderChannelPresence; localDurability: BuilderDurability }> {
  const [connection, beats] = await Promise.all([
    readConnectionFlags(userId, runnerVersion),
    readChannelHeartbeats(userId),
  ]);
  const now = Date.now();
  return {
    presence: applyHeartbeatExpiry(connection, beats, now),
    localDurability: channelDurability("local", beats, now),
  };
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

/**
 * Last heartbeat per channel. A read failure must not invent liveness.
 *
 * Two-tier select, same shape as readConnectionFlags above, and for a sharper
 * reason: the `[]` fallback does not merely lose power state — it makes EVERY
 * builder read offline, because applyHeartbeatExpiry requires a fresh beat.
 * So a `power_source` column that has not been migrated yet would take dispatch
 * down entirely rather than degrade it. The deploy applies migrations before it
 * rsyncs the new code, so this should never fire; it exists because "should
 * never" is not a property a production outage respects.
 */
async function readChannelHeartbeats(userId: string): Promise<ChannelHeartbeat[]> {
  try {
    return await db
      .select({
        channel: runtimeSnapshots.channel,
        observedAt: runtimeSnapshots.observedAt,
        powerSource: runtimeSnapshots.powerSource,
      })
      .from(runtimeSnapshots)
      .where(eq(runtimeSnapshots.userId, userId));
  } catch {
    try {
      // Liveness without durability: every builder keeps working, and routing
      // reads "unknown" power, which is exactly the pre-durability behavior.
      return await db
        .select({ channel: runtimeSnapshots.channel, observedAt: runtimeSnapshots.observedAt })
        .from(runtimeSnapshots)
        .where(eq(runtimeSnapshots.userId, userId));
    } catch {
      return [];
    }
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
