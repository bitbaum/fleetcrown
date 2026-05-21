import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runtimeSnapshots } from "@/db/schema/runtime-snapshots";

export async function upsertRuntimeSnapshot(userId: string, openTabs: string[]) {
  const [row] = await db
    .insert(runtimeSnapshots)
    .values({ userId, openTabs, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: runtimeSnapshots.userId,
      set: { openTabs, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function getRuntimeSnapshot(userId: string) {
  const [row] = await db
    .select()
    .from(runtimeSnapshots)
    .where(eq(runtimeSnapshots.userId, userId))
    .limit(1);
  return row ?? null;
}
