import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { commitments, events, subscriptions } from "@/db/schema";
import { eq, and, lte, gte, sql } from "drizzle-orm";

export async function getActiveCommitments() {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, DEFAULT_USER_ID),
        eq(commitments.status, "active"),
      ),
    )
    .orderBy(commitments.dueDate);
}

export async function getUpcomingEvents(days = 7) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, DEFAULT_USER_ID),
        eq(events.status, "active"),
        gte(events.dateStart, now),
        lte(events.dateStart, future),
      ),
    )
    .orderBy(events.dateStart);
}

export async function getUpcomingSubscriptions(days = 7) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, DEFAULT_USER_ID),
        eq(subscriptions.status, "active"),
        lte(subscriptions.nextDue, future),
      ),
    )
    .orderBy(subscriptions.nextDue);
}
