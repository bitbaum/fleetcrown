import { EVENTS_DUE_SOON_DAYS } from "@/lib/constants";
import { EVENT_STATUS, type EventStatus } from "@/lib/constants/statuses";
import { db } from "@/db";
import { events, type EventRow } from "@/db/schema";
import { eq, asc, and, lte, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

export type { EventRow };

const EVENT_STATUSES = Object.values(EVENT_STATUS) as [EventStatus, ...EventStatus[]];

export const CreateEventBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  type: z.string().trim().min(1, "type is required"),
  description: z.string().trim().optional(),
  url: z.string().trim().optional(),
  deadline: z.string().optional(),
  category: z.string().trim().optional(),
});

export const PatchEventBody = z
  .object({
    status: z.enum(EVENT_STATUSES, { error: "Invalid status" }).optional(),
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    description: z.string().nullable().optional(),
    url: z.string().trim().nullable().optional(),
    deadline: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export type PatchEventInput = z.infer<typeof PatchEventBody>;

export async function getEventsDueSoon(userId: string, days = EVENTS_DUE_SOON_DAYS): Promise<EventRow[]> {
  const soon = new Date();
  soon.setDate(soon.getDate() + days);

  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.status, EVENT_STATUS.ACTIVE),
        isNotNull(events.deadline),
        lte(events.deadline, soon),
      ),
    )
    .orderBy(asc(events.deadline));
}

export async function getEvents(userId: string): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.status, EVENT_STATUS.ACTIVE)))
    .orderBy(
      sql`CASE WHEN ${events.deadline} IS NOT NULL THEN 0 ELSE 1 END`,
      asc(events.deadline),
      asc(events.name),
    );
}

export async function getArchivedEvents(userId: string): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.status, EVENT_STATUS.ARCHIVED)))
    .orderBy(
      sql`CASE WHEN ${events.deadline} IS NOT NULL THEN 0 ELSE 1 END`,
      asc(events.deadline),
      asc(events.name),
    );
}
