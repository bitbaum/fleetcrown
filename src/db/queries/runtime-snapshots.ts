import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { runtimeSnapshots, type PaneRecord } from "@/db/schema/runtime-snapshots";
import type { RunnerChannel } from "@/db/schema/pending-commands";

export async function upsertRuntimeSnapshotIfNewer(
  userId: string,
  channel: RunnerChannel,
  openTabs: string[],
  observedAt: Date,
  installedAgents?: string[],
  panes?: PaneRecord[],
  runnerVersion?: string,
) {
  const snapshot = {
    userId,
    channel,
    openTabs,
    observedAt,
    updatedAt: new Date(),
    ...(installedAgents ? { installedAgents } : {}),
    ...(panes ? { panes } : {}),
    ...(runnerVersion ? { runnerVersion } : {}),
  };
  const [inserted] = await db
    .insert(runtimeSnapshots)
    .values(snapshot)
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;
  const [updated] = await db
    .update(runtimeSnapshots)
    .set(snapshot)
    .where(and(
      eq(runtimeSnapshots.userId, userId),
      eq(runtimeSnapshots.channel, channel),
      or(isNull(runtimeSnapshots.observedAt), lt(runtimeSnapshots.observedAt, observedAt)),
    ))
    .returning();
  return updated ?? null;
}

export async function getRuntimeSnapshot(userId: string, channel?: RunnerChannel) {
  const query = db
    .select()
    .from(runtimeSnapshots)
    .where(channel
      ? and(eq(runtimeSnapshots.userId, userId), eq(runtimeSnapshots.channel, channel))
      : eq(runtimeSnapshots.userId, userId))
    .orderBy(desc(runtimeSnapshots.updatedAt))
    .limit(1);
  const [row] = await query;
  return row ?? null;
}

/**
 * All channel rows for a user (cloud + local push their OWN row every ~5min).
 * Callers that describe "the fleet" must read BOTH — the channel-less
 * getRuntimeSnapshot above returns whichever channel pushed last, so a
 * cloud push silently erased the laptop's open tabs (and vice versa) from
 * any consumer that treated one row as the whole truth.
 */
export async function getRuntimeSnapshots(userId: string) {
  return db
    .select()
    .from(runtimeSnapshots)
    .where(eq(runtimeSnapshots.userId, userId))
    .orderBy(desc(runtimeSnapshots.updatedAt));
}
