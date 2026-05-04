import { db } from "@/db";
import { entities, entityRelations, interactions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export async function getEntityStats(userId: string) {
  const [typeRows, [relCount]] = await Promise.all([
    db
      .select({ type: entities.type, count: sql<number>`count(*)` })
      .from(entities)
      .where(eq(entities.userId, userId))
      .groupBy(entities.type)
      .orderBy(sql`count(*) DESC`),
    db
      .select({ count: sql<number>`count(*)` })
      .from(entityRelations)
      .where(eq(entityRelations.userId, userId)),
  ]);

  return {
    entityTypes: typeRows,
    totalEntities: typeRows.reduce((sum, r) => sum + Number(r.count), 0),
    totalRelations: Number(relCount.count),
  };
}

export async function getRecentEntities(userId: string, limit = 10) {
  return db
    .select({
      id: entities.id,
      name: entities.name,
      type: entities.type,
      description: entities.description,
      createdAt: entities.createdAt,
    })
    .from(entities)
    .where(eq(entities.userId, userId))
    .orderBy(desc(entities.createdAt))
    .limit(limit);
}

export async function getRecentInteractions(userId: string, limit = 10) {
  return db
    .select({
      id: interactions.id,
      channel: interactions.channel,
      direction: interactions.direction,
      summary: interactions.summary,
      occurredAt: interactions.occurredAt,
      entityId: interactions.entityId,
      entityName: entities.name,
      entityType: entities.type,
    })
    .from(interactions)
    .innerJoin(entities, eq(interactions.entityId, entities.id))
    .where(eq(interactions.userId, userId))
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);
}
