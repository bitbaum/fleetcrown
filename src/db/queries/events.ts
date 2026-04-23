import { DEFAULT_USER_ID } from "@/lib/constants";
import { EVENT_STATUS } from "@/lib/constants/statuses";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, asc, and, lte, isNotNull, sql } from "drizzle-orm";

export type EventRow = typeof events.$inferSelect;

export async function getEventsDueSoon(days = 14): Promise<EventRow[]> {
  const soon = new Date();
  soon.setDate(soon.getDate() + days);

  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, DEFAULT_USER_ID),
        eq(events.status, EVENT_STATUS.ACTIVE),
        isNotNull(events.deadline),
        lte(events.deadline, soon),
      ),
    )
    .orderBy(asc(events.deadline));
}

export async function getEvents(): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, DEFAULT_USER_ID), eq(events.status, EVENT_STATUS.ACTIVE)))
    .orderBy(
      // Events with deadlines first, then by deadline asc, then by name
      sql`CASE WHEN ${events.deadline} IS NOT NULL THEN 0 ELSE 1 END`,
      asc(events.deadline),
      asc(events.name),
    );
}
