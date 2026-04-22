import { NextResponse } from "next/server";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { entities, entityRelations, interactions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { fetchAttributesByEntityIds } from "@/db/queries/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json(null, { status: 400 });

  const [project] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)));

  if (!project) return NextResponse.json(null, { status: 404 });

  const attrMap = await fetchAttributesByEntityIds([id]);
  const attrs = attrMap.get(id) ?? {};

  // Related entities (people, other projects)
  const relations = await db
    .select()
    .from(entityRelations)
    .where(
      and(
        eq(entityRelations.fromEntityId, id),
        eq(entityRelations.userId, DEFAULT_USER_ID),
      ),
    );

  const relatedIds = relations.map((r) => r.toEntityId);
  let relatedEntities: Array<{ id: string; name: string; type: string }> = [];
  if (relatedIds.length > 0) {
    relatedEntities = await db
      .select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(and(eq(entities.userId, DEFAULT_USER_ID)));
    relatedEntities = relatedEntities.filter((e) => relatedIds.includes(e.id));
  }

  const relationsWithNames = relations.map((r) => ({
    type: r.type,
    strength: r.strength,
    targetId: r.toEntityId,
    targetName: relatedEntities.find((e) => e.id === r.toEntityId)?.name ?? r.toEntityId,
    targetType: relatedEntities.find((e) => e.id === r.toEntityId)?.type ?? "unknown",
  }));

  // Recent interactions
  const recentInteractions = await db
    .select()
    .from(interactions)
    .where(
      and(
        eq(interactions.entityId, id),
        eq(interactions.userId, DEFAULT_USER_ID),
      ),
    )
    .orderBy(desc(interactions.occurredAt))
    .limit(5);

  return NextResponse.json({
    id: project.id,
    name: project.name,
    type: project.type,
    description: project.description,
    source: project.source,
    attrs,
    relations: relationsWithNames,
    interactions: recentInteractions.map((i) => ({
      channel: i.channel,
      direction: i.direction,
      summary: i.summary,
      occurredAt: i.occurredAt,
    })),
  });
}
