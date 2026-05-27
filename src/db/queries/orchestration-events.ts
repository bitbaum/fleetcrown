import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orchestrationEvents, type NewOrchestrationEvent } from "@/db/schema/orchestration-events";
import type { OrchestrationEventType } from "@/lib/orchestration";

type LatestLifecycleEvents = Partial<Record<OrchestrationEventType, Date>>;

export async function createOrchestrationEvent(event: NewOrchestrationEvent) {
  const [created] = await db.insert(orchestrationEvents).values(event).returning();
  return created;
}

/** Idempotent insertion for events derived repeatedly from the same runtime sentinel. */
export async function createOrchestrationEventOnce(event: NewOrchestrationEvent, dedupeKey: string) {
  const [created] = await db
    .insert(orchestrationEvents)
    .values({ ...event, dedupeKey })
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

export async function getLatestEventsByProjectKeys(
  userId: string,
  projectKeys: string[],
  eventTypes?: OrchestrationEventType[],
): Promise<Map<string, LatestLifecycleEvents>> {
  const latest = new Map<string, LatestLifecycleEvents>();
  if (projectKeys.length === 0) return latest;
  const conditions = [
    eq(orchestrationEvents.userId, userId),
    inArray(orchestrationEvents.projectKey, projectKeys),
  ];
  if (eventTypes?.length) {
    conditions.push(inArray(orchestrationEvents.eventType, eventTypes));
  }

  const rows = await db
    .select()
    .from(orchestrationEvents)
    .where(and(...conditions))
    .orderBy(desc(orchestrationEvents.happenedAt));

  for (const row of rows) {
    const byType = latest.get(row.projectKey) ?? {};
    if (!byType[row.eventType]) {
      byType[row.eventType] = row.happenedAt;
      latest.set(row.projectKey, byType);
    }
  }

  return latest;
}
