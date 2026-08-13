import { db } from "@/db";
import { entities, attributes, interactions, entityRelations, actions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { fetchAttributesByEntityIds } from "./utils";
import { clusterPeople, type DuplicateCluster } from "@/lib/people-dedupe";
import { canMarket } from "@/config/actors";

export async function listPeopleForDedupe(userId: string) {
  const rows = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON)));
  const attrs = await fetchAttributesByEntityIds(rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, name: r.name, attrs: attrs.get(r.id) ?? {} }));
}

export async function findDuplicatePeople(userId: string): Promise<DuplicateCluster[]> {
  return clusterPeople(await listPeopleForDedupe(userId));
}

/**
 * Collapse two person rows. Winner keeps name. Loser attrs fill gaps.
 * Interactions and relations move. Loser is deleted.
 * Robots cannot be merged into people — type is checked on both rows.
 */
export async function mergePeoplePair(userId: string, keepId: string, dropId: string): Promise<{ keepId: string; dropId: string }> {
  if (keepId === dropId) throw new Error("Cannot merge a person with themselves");

  await db.transaction(async (tx) => {
    const [keep] = await tx
      .select()
      .from(entities)
      .where(and(eq(entities.id, keepId), eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON)));
    const [drop] = await tx
      .select()
      .from(entities)
      .where(and(eq(entities.id, dropId), eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PERSON)));
    if (!keep || !drop) throw new Error("Both people must exist in your book");
    if (canMarket(keep.type) || canMarket(drop.type)) {
      throw new Error("Robots are not merged through the people book");
    }

    const loserAttrs = await tx.select().from(attributes).where(eq(attributes.entityId, dropId));
    const winnerAttrs = await tx.select().from(attributes).where(eq(attributes.entityId, keepId));
    const winnerKeys = new Set(winnerAttrs.map((a) => a.key));

    for (const attr of loserAttrs) {
      if (winnerKeys.has(attr.key)) {
        await tx.delete(attributes).where(eq(attributes.id, attr.id));
      } else {
        await tx.update(attributes).set({ entityId: keepId, updatedAt: new Date() }).where(eq(attributes.id, attr.id));
      }
    }

    await tx.update(interactions).set({ entityId: keepId }).where(eq(interactions.entityId, dropId));
    await tx.update(actions).set({ entityId: keepId }).where(eq(actions.entityId, dropId));

    const fromRels = await tx.select().from(entityRelations).where(eq(entityRelations.fromEntityId, dropId));
    for (const rel of fromRels) {
      const [clash] = await tx
        .select({ id: entityRelations.id })
        .from(entityRelations)
        .where(and(
          eq(entityRelations.userId, rel.userId),
          eq(entityRelations.fromEntityId, keepId),
          eq(entityRelations.type, rel.type),
          eq(entityRelations.toEntityId, rel.toEntityId),
        ))
        .limit(1);
      if (clash) await tx.delete(entityRelations).where(eq(entityRelations.id, rel.id));
      else await tx.update(entityRelations).set({ fromEntityId: keepId, updatedAt: new Date() }).where(eq(entityRelations.id, rel.id));
    }

    const toRels = await tx.select().from(entityRelations).where(eq(entityRelations.toEntityId, dropId));
    for (const rel of toRels) {
      const [clash] = await tx
        .select({ id: entityRelations.id })
        .from(entityRelations)
        .where(and(
          eq(entityRelations.userId, rel.userId),
          eq(entityRelations.fromEntityId, rel.fromEntityId),
          eq(entityRelations.type, rel.type),
          eq(entityRelations.toEntityId, keepId),
        ))
        .limit(1);
      if (clash) await tx.delete(entityRelations).where(eq(entityRelations.id, rel.id));
      else await tx.update(entityRelations).set({ toEntityId: keepId, updatedAt: new Date() }).where(eq(entityRelations.id, rel.id));
    }

    await tx
      .update(entities)
      .set({
        description: keep.description ?? drop.description,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, keepId));

    await tx.delete(entities).where(eq(entities.id, dropId));
  });

  return { keepId, dropId };
}
