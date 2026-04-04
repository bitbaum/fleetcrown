import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { entities, attributes, entityRelations } from "@/db/schema";
import { eq, and, ilike, sql } from "drizzle-orm";
import { fetchAttributesByEntityIds } from "./utils";

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export type PersonWithAttributes = {
  id: string;
  name: string;
  externalId: string | null;
  description: string | null;
  source: string | null;
  attrs: Record<string, string>;
};

export async function searchPeople(
  query: string,
  limit = 50,
  offset = 0,
): Promise<{ people: PersonWithAttributes[]; total: number }> {
  const where = query.trim()
    ? and(
        eq(entities.userId, DEFAULT_USER_ID),
        eq(entities.type, "person"),
        ilike(entities.name, `%${escapeLike(query.trim())}%`),
      )
    : and(
        eq(entities.userId, DEFAULT_USER_ID),
        eq(entities.type, "person"),
      );

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(entities)
    .where(where);

  const people = await db
    .select()
    .from(entities)
    .where(where)
    .orderBy(entities.name)
    .limit(limit)
    .offset(offset);

  const attrsByEntity = await fetchAttributesByEntityIds(people.map((p) => p.id));

  return {
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      externalId: p.externalId,
      description: p.description,
      source: p.source,
      attrs: attrsByEntity.get(p.id) ?? {},
    })),
    total: Number(countResult.count),
  };
}

export async function getPersonDetail(id: string) {
  const [person] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)));

  if (!person) return null;

  const attrs = await db
    .select()
    .from(attributes)
    .where(eq(attributes.entityId, id));

  const relationsFrom = await db
    .select({
      type: entityRelations.type,
      strength: entityRelations.strength,
      targetId: entityRelations.toEntityId,
      targetName: entities.name,
      targetType: entities.type,
    })
    .from(entityRelations)
    .innerJoin(entities, eq(entities.id, entityRelations.toEntityId))
    .where(eq(entityRelations.fromEntityId, id));

  const relationsTo = await db
    .select({
      type: entityRelations.type,
      strength: entityRelations.strength,
      targetId: entityRelations.fromEntityId,
      targetName: entities.name,
      targetType: entities.type,
    })
    .from(entityRelations)
    .innerJoin(entities, eq(entities.id, entityRelations.fromEntityId))
    .where(eq(entityRelations.toEntityId, id));

  return {
    ...person,
    attrs: Object.fromEntries(attrs.map((a) => [a.key, a.value])),
    relations: [...relationsFrom, ...relationsTo],
  };
}
