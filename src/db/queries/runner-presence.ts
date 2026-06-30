import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runnerPresence } from "@/db/schema/runner-presence";
import type { BuilderChannelPresence } from "@/lib/builder-presence";
import { inferBuilderChannelPresence } from "@/lib/builder-presence";

/**
 * Is any builder connected for this user? Connection-based presence —
 * written by the bridge on SSE connect/disconnect, not a heartbeat.
 */
export async function getRunnerConnected(userId: string): Promise<boolean> {
  const presence = await getBuilderPresence(userId);
  return presence.any;
}

/** Cloud vs local builder channels (A4). Falls back when migration not applied yet. */
export async function getBuilderPresence(
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
 * Mark presence for a HOSTED runner (Hermes Phase 0 path without bridge SSE).
 * Box-runner should use bridge channel=cloud instead.
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
