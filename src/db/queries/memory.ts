import { db } from "@/db";
import {
  entities,
  entityRelations,
  interactions,
  attributes,
  knowledgeEmbeddings,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

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
    .innerJoin(entities, and(eq(interactions.entityId, entities.id), eq(entities.userId, userId)))
    .where(eq(interactions.userId, userId))
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);
}

/**
 * Forget ONE entity (data controls). Attributes / interactions / relations
 * cascade via entity_id. Scoped to the owner; returns whether a row went.
 */
export async function forgetEntity(userId: string, entityId: string): Promise<boolean> {
  const deleted = await db
    .delete(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, userId)))
    .returning({ id: entities.id });
  return deleted.length > 0;
}

/**
 * Forget EVERYTHING (data controls): the whole knowledge graph and the RAG
 * vector index. Children first — attributes/interactions/relations each carry
 * a non-cascading user_id FK, so clear them by user before the entities go.
 * One transaction: all gone or nothing is.
 */
export async function forgetAllMemory(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(interactions).where(eq(interactions.userId, userId));
    await tx.delete(attributes).where(eq(attributes.userId, userId));
    await tx.delete(entityRelations).where(eq(entityRelations.userId, userId));
    await tx.delete(entities).where(eq(entities.userId, userId));
    await tx.delete(knowledgeEmbeddings).where(eq(knowledgeEmbeddings.userId, userId));
  });
}
