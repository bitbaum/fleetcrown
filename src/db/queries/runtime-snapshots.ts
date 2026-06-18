import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { runtimeSnapshots, type PaneRecord } from "@/db/schema/runtime-snapshots";

export async function upsertRuntimeSnapshotIfNewer(
  userId: string,
  openTabs: string[],
  observedAt: Date,
  installedAgents?: string[],
  panes?: PaneRecord[],
  runnerVersion?: string,
) {
  const snapshot = {
    userId,
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
      or(isNull(runtimeSnapshots.observedAt), lt(runtimeSnapshots.observedAt, observedAt)),
    ))
    .returning();
  return updated ?? null;
}

export async function getRuntimeSnapshot(userId: string) {
  const [row] = await db
    .select()
    .from(runtimeSnapshots)
    .where(eq(runtimeSnapshots.userId, userId))
    .limit(1);
  return row ?? null;
}
