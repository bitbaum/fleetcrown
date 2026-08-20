import { db } from "@/db";
import { captures } from "@/db/schema";
import { eq, desc, and, count } from "drizzle-orm";

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

export async function countCaptures(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(captures)
    .where(eq(captures.userId, userId));
  return row?.n ?? 0;
}

export async function deleteCapture(userId: string, id: string) {
  const [deleted] = await db
    .delete(captures)
    .where(and(eq(captures.id, id), eq(captures.userId, userId)))
    .returning({ id: captures.id });
  return deleted ?? null;
}
