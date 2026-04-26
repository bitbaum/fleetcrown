import { db } from "@/db";
import { attributes, entities, interactions, type Interaction } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";

export async function fetchAttributesByEntityIds(
  entityIds: string[],
): Promise<Map<string, Record<string, string>>> {
  if (entityIds.length === 0) return new Map();

  const allAttrs = await db
    .select()
    .from(attributes)
    .where(
      sql`${attributes.entityId} IN (${sql.join(
        entityIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );

  const grouped = new Map<string, Record<string, string>>();
  for (const attr of allAttrs) {
    const existing = grouped.get(attr.entityId) ?? {};
    existing[attr.key] = attr.value;
    grouped.set(attr.entityId, existing);
  }
  return grouped;
}

/** Verifies the entity belongs to the user before upserting an attribute.
 *  Returns false if the entity wasn't found (caller should 404). */
export async function upsertEntityAttribute(
  entityId: string,
  key: string,
  value: string,
): Promise<boolean> {
  const [owner] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, DEFAULT_USER_ID)));
  if (!owner) return false;

  await db
    .insert(attributes)
    .values({
      userId: DEFAULT_USER_ID,
      entityId,
      key: key.toLowerCase().replace(/\s+/g, "_"),
      value,
      source: "cockpit-ui",
    })
    .onConflictDoUpdate({
      target: [attributes.entityId, attributes.key],
      set: { value, updatedAt: new Date() },
    });
  return true;
}

/** Deletes the (entity, key) attribute for the current user. */
export async function deleteEntityAttribute(entityId: string, key: string): Promise<void> {
  await db
    .delete(attributes)
    .where(
      and(
        eq(attributes.entityId, entityId),
        eq(attributes.key, key),
        eq(attributes.userId, DEFAULT_USER_ID),
      ),
    );
}

/** Verifies the entity belongs to the user before recording an interaction.
 *  Returns the created row, or null if the entity wasn't found (caller should 404). */
export async function createEntityInteraction(
  entityId: string,
  body: { channel: string; direction: "inbound" | "outbound"; summary?: string; occurredAt?: string },
): Promise<Interaction | null> {
  const [owner] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, DEFAULT_USER_ID)));
  if (!owner) return null;

  const [created] = await db
    .insert(interactions)
    .values({
      userId: DEFAULT_USER_ID,
      entityId,
      channel: body.channel,
      direction: body.direction,
      summary: body.summary || null,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    })
    .returning();
  return created;
}
