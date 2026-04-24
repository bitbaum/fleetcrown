import { DEFAULT_USER_ID, DEFAULT_USER_EXTERNAL_ID } from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { db } from "@/db";
import { entities, attributes, entityRelations, interactions } from "@/db/schema";
import { eq, and, ne, ilike, sql, desc, type SQL } from "drizzle-orm";
import { fetchAttributesByEntityIds } from "./utils";
import { deriveRelationshipHealth, type RelationshipHealth, HEALTH_ACTIVE_DAYS, HEALTH_FADING_DAYS } from "@/lib/utils";

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
  relationCount: number;
  health: RelationshipHealth;
};

export type SortMode = "recent" | "name" | "health";

// Build HAVING clause for health filtering — all health values are enum literals, not user input
// Thresholds sourced from HEALTH_ACTIVE_DAYS / HEALTH_FADING_DAYS in lib/utils.ts
function buildHealthHaving(health: RelationshipHealth[]): SQL {
  const clauses: SQL[] = [];
  if (health.includes("active"))  clauses.push(sql`max(i.occurred_at) >= now() - make_interval(days => ${HEALTH_ACTIVE_DAYS})`);
  if (health.includes("fading"))  clauses.push(sql`max(i.occurred_at) BETWEEN now() - make_interval(days => ${HEALTH_FADING_DAYS}) AND now() - make_interval(days => ${HEALTH_ACTIVE_DAYS})`);
  if (health.includes("stale"))   clauses.push(sql`max(i.occurred_at) < now() - make_interval(days => ${HEALTH_FADING_DAYS})`);
  if (health.includes("unknown")) clauses.push(sql`max(i.occurred_at) IS NULL`);
  if (clauses.length === 0) return sql``;
  return sql`HAVING (${sql.join(clauses, sql` OR `)})`;
}

export async function searchPeople(
  query: string,
  limit = 50,
  offset = 0,
  sort: SortMode = "recent",
  health: RelationshipHealth[] = [],
): Promise<{ people: PersonWithAttributes[]; total: number }> {
  // User input — parameterized via sql tagged template (never string-interpolated)
  const nameFilter: SQL = query.trim()
    ? sql`AND e.name ILIKE ${"%" + escapeLike(query.trim()) + "%"}`
    : sql``;
  const having: SQL = buildHealthHaving(health);

  const orderBy: SQL = sort === "name"
    ? sql`e.name ASC`
    : sort === "health"
      ? sql`last_interaction ASC NULLS FIRST`
      : sql`last_interaction DESC NULLS LAST`;

  const [countResult, rows] = await Promise.all([
    db.execute<{ count: string }>(sql`
      SELECT count(*)::text as count FROM (
        SELECT e.id
        FROM entities e
        LEFT JOIN interactions i ON i.entity_id = e.id
        WHERE e.user_id = ${DEFAULT_USER_ID} AND e.type = ${ENTITY_TYPE.PERSON} AND e.external_id != ${DEFAULT_USER_EXTERNAL_ID}
        ${nameFilter}
        GROUP BY e.id
        ${having}
      ) sub
    `),
    db.execute<{
      id: string;
      name: string;
      external_id: string | null;
      description: string | null;
      source: string | null;
      last_interaction: Date | null;
      interaction_count: string;
      relation_count: string;
    }>(sql`
      SELECT e.id, e.name, e.external_id, e.description, e.source,
             max(i.occurred_at) as last_interaction,
             count(DISTINCT i.id)::text as interaction_count,
             (SELECT count(*) FROM entity_relations r
              WHERE r.from_entity_id = e.id OR r.to_entity_id = e.id)::text as relation_count
      FROM entities e
      LEFT JOIN interactions i ON i.entity_id = e.id
      WHERE e.user_id = ${DEFAULT_USER_ID} AND e.type = ${ENTITY_TYPE.PERSON} AND e.external_id != ${DEFAULT_USER_EXTERNAL_ID}
      ${nameFilter}
      GROUP BY e.id
      ${having}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `),
  ]);

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
        relationCount: Number(r.relation_count),
        health: deriveRelationshipHealth(lastInteraction),
      };
    }),
    total: Number(countResult[0].count),
  };
}

export async function getPersonDetail(id: string) {
  const [person] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)));

  if (!person) return null;

  const [attrs, relationsFrom, relationsTo, recentInteractions] = await Promise.all([
    db.select().from(attributes).where(eq(attributes.entityId, id)),
    db
      .select({
        type: entityRelations.type,
        strength: entityRelations.strength,
        targetId: entityRelations.toEntityId,
        targetName: entities.name,
        targetType: entities.type,
      })
      .from(entityRelations)
      .innerJoin(entities, eq(entities.id, entityRelations.toEntityId))
      .where(eq(entityRelations.fromEntityId, id)),
    db
      .select({
        type: entityRelations.type,
        strength: entityRelations.strength,
        targetId: entityRelations.fromEntityId,
        targetName: entities.name,
        targetType: entities.type,
      })
      .from(entityRelations)
      .innerJoin(entities, eq(entities.id, entityRelations.fromEntityId))
      .where(eq(entityRelations.toEntityId, id)),
    db
      .select()
      .from(interactions)
      .where(eq(interactions.entityId, id))
      .orderBy(desc(interactions.occurredAt))
      .limit(10),
  ]);

  return {
    ...person,
    attrs: Object.fromEntries(attrs.map((a) => [a.key, a.value])),
    relations: [...relationsFrom, ...relationsTo],
    interactions: recentInteractions,
  };
}

export async function createInteraction({
  entityId,
  channel,
  direction,
  summary,
  occurredAt,
}: {
  entityId: string;
  channel: string;
  direction: "inbound" | "outbound";
  summary?: string | null;
  occurredAt?: Date;
}) {
  const [created] = await db
    .insert(interactions)
    .values({
      userId: DEFAULT_USER_ID,
      entityId,
      channel,
      direction,
      summary: summary ?? null,
      occurredAt: occurredAt ?? new Date(),
    })
    .returning();
  return created;
}
