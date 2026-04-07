import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { entities, attributes, entityRelations, interactions } from "@/db/schema";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
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
  lastInteraction: Date | null;
  interactionCount: number;
  health: "active" | "fading" | "stale" | "unknown";
};

function deriveHealth(lastInteraction: Date | null): PersonWithAttributes["health"] {
  if (!lastInteraction) return "unknown";
  const daysSince = (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 14) return "active";
  if (daysSince <= 30) return "fading";
  return "stale";
}

export type SortMode = "recent" | "name" | "health";

export async function searchPeople(
  query: string,
  limit = 50,
  offset = 0,
  sort: SortMode = "recent",
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

  // Join with interaction stats
  const orderClause = sort === "name"
    ? sql`e.name ASC`
    : sort === "health"
      ? sql`last_interaction ASC NULLS FIRST`
      : sql`last_interaction DESC NULLS LAST`;

  const rows = await db.execute<{
    id: string;
    name: string;
    external_id: string | null;
    description: string | null;
    source: string | null;
    last_interaction: Date | null;
    interaction_count: string;
  }>(sql`
    SELECT e.id, e.name, e.external_id, e.description, e.source,
           max(i.occurred_at) as last_interaction,
           count(i.id)::text as interaction_count
    FROM entities e
    LEFT JOIN interactions i ON i.entity_id = e.id
    WHERE e.user_id = ${DEFAULT_USER_ID} AND e.type = 'person'
    ${query.trim() ? sql`AND e.name ILIKE ${"%" + escapeLike(query.trim()) + "%"}` : sql``}
    GROUP BY e.id
    ORDER BY ${orderClause}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const peopleIds = rows.map((r) => r.id);
  const attrsByEntity = await fetchAttributesByEntityIds(peopleIds);

  return {
    people: rows.map((r) => {
      const lastInteraction = r.last_interaction ? new Date(r.last_interaction) : null;
      return {
        id: r.id,
        name: r.name,
        externalId: r.external_id,
        description: r.description,
        source: r.source,
        attrs: attrsByEntity.get(r.id) ?? {},
        lastInteraction,
        interactionCount: Number(r.interaction_count),
        health: deriveHealth(lastInteraction),
      };
    }),
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

  const recentInteractions = await db
    .select()
    .from(interactions)
    .where(eq(interactions.entityId, id))
    .orderBy(desc(interactions.occurredAt))
    .limit(10);

  return {
    ...person,
    attrs: Object.fromEntries(attrs.map((a) => [a.key, a.value])),
    relations: [...relationsFrom, ...relationsTo],
    interactions: recentInteractions,
  };
}
