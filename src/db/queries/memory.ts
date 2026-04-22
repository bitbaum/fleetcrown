import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { entities, entityRelations, interactions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export async function getEntityStats() {
  const [typeRows, [relCount]] = await Promise.all([
    db
      .select({ type: entities.type, count: sql<number>`count(*)` })
      .from(entities)
      .where(eq(entities.userId, DEFAULT_USER_ID))
      .groupBy(entities.type)
      .orderBy(sql`count(*) DESC`),
    db
      .select({ count: sql<number>`count(*)` })
      .from(entityRelations)
      .where(eq(entityRelations.userId, DEFAULT_USER_ID)),
  ]);

  return {
    entityTypes: typeRows,
    totalEntities: typeRows.reduce((sum, r) => sum + Number(r.count), 0),
    totalRelations: Number(relCount.count),
  };
}

export async function getRecentEntities(limit = 10) {
  return db
    .select({
      id: entities.id,
      name: entities.name,
      type: entities.type,
      description: entities.description,
      createdAt: entities.createdAt,
    })
    .from(entities)
    .where(eq(entities.userId, DEFAULT_USER_ID))
    .orderBy(desc(entities.createdAt))
    .limit(limit);
}

export async function getRecentInteractions(limit = 10) {
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
    .where(eq(interactions.userId, DEFAULT_USER_ID))
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);
}
