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
