import { DEFAULT_USER_ID, EVENTS_DUE_SOON_DAYS } from "@/lib/constants";
import { EVENT_STATUS } from "@/lib/constants/statuses";
import { db } from "@/db";
import { events, type EventRow } from "@/db/schema";
import { eq, asc, and, lte, isNotNull, sql } from "drizzle-orm";

// Re-export so existing `import type { EventRow } from "@/db/queries/events"`
// callers keep working without a sweep.
export type { EventRow };

export async function getEventsDueSoon(days = EVENTS_DUE_SOON_DAYS): Promise<EventRow[]> {
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

export async function getArchivedEvents(): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, DEFAULT_USER_ID), eq(events.status, EVENT_STATUS.ARCHIVED)))
    .orderBy(
      sql`CASE WHEN ${events.deadline} IS NOT NULL THEN 0 ELSE 1 END`,
      asc(events.deadline),
      asc(events.name),
    );
}
