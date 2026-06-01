import { count, and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  entities,
  goals,
  habits,
  events,
  subscriptions,
  commitments,
} from "@/db/schema";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

export type PrivateZoneStats = {
  memoryEntities: number;
  people: number;
  goals: number;
  habits: number;
  events: number;
  subscriptions: number;
  commitments: number;
};

/**
 * Aggregate counts for everything that lives behind the private-zone gate.
 *
 * Used on /unlock so the user sees concretely what unlocking restores
 * ("105 contacts, 7 goals, 38 events" beats "your private data"). One
 * round-trip per category — they're independent COUNTs that can run in
 * parallel.
 */
export async function getPrivateZoneStats(userId: string): Promise<PrivateZoneStats> {
  const [
    memoryEntitiesRow,
    peopleRow,
    goalsRow,
    habitsRow,
    eventsRow,
    subscriptionsRow,
    commitmentsRow,
  ] = await Promise.all([
    db.select({ n: count() }).from(entities).where(eq(entities.userId, userId)),
    db.select({ n: count() }).from(entities).where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON))),
    db.select({ n: count() }).from(goals).where(eq(goals.userId, userId)),
    db.select({ n: count() }).from(habits).where(eq(habits.userId, userId)),
    db.select({ n: count() }).from(events).where(eq(events.userId, userId)),
    db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.userId, userId)),
    db.select({ n: count() }).from(commitments).where(and(eq(commitments.userId, userId), isNotNull(commitments.createdAt))),
  ]);

  return {
    memoryEntities: memoryEntitiesRow[0]?.n ?? 0,
    people: peopleRow[0]?.n ?? 0,
    goals: goalsRow[0]?.n ?? 0,
    habits: habitsRow[0]?.n ?? 0,
    events: eventsRow[0]?.n ?? 0,
    subscriptions: subscriptionsRow[0]?.n ?? 0,
    commitments: commitmentsRow[0]?.n ?? 0,
  };
}
