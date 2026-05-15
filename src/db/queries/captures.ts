import { db } from "@/db";
import { captures } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function createCapture(userId: string, body: string) {
  const [capture] = await db
    .insert(captures)
    .values({ userId, body })
    .returning();
  return capture;
}

export async function listCaptures(userId: string, limit = 20) {
  return db
    .select()
    .from(captures)
    .where(eq(captures.userId, userId))
    .orderBy(desc(captures.createdAt))
    .limit(limit);
}

export async function deleteCapture(userId: string, id: string) {
  const [deleted] = await db
    .delete(captures)
    .where(eq(captures.id, id))
    .returning({ id: captures.id, userId: captures.userId });
  if (!deleted || deleted.userId !== userId) return null;
  return deleted;
}
