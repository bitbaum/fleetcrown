import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";

export type EventRow = typeof events.$inferSelect;

export async function getEvents(): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(eq(events.userId, DEFAULT_USER_ID))
    .orderBy(
      // Events with deadlines first, then by deadline asc, then by name
      sql`CASE WHEN ${events.deadline} IS NOT NULL THEN 0 ELSE 1 END`,
      asc(events.deadline),
      asc(events.name),
    );
}
