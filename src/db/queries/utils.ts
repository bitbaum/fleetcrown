import { db } from "@/db";
import { attributes, entities, interactions, type Interaction } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { SOURCE_COCKPIT_UI } from "@/lib/constants";
import { INTERACTION_DIRECTION, type InteractionDirection } from "@/lib/constants/statuses";
import { z } from "zod";

/** Shared validator for the two `/api/<entity>/[id]/interactions` POST routes. */
const DIRECTIONS = Object.values(INTERACTION_DIRECTION) as [InteractionDirection, ...InteractionDirection[]];
export const CreateInteractionBody = z.object({
  channel: z.string().trim().min(1, "channel is required"),
  direction: z.enum(DIRECTIONS, { error: "direction must be inbound or outbound" }),
  summary: z.string().trim().optional(),
  occurredAt: z.string().optional(),
});

/** Shared validators for the two `/api/<entity>/[id]/attrs` routes. */
export const SetAttrBody = z.object({
  key: z.string().trim().min(1, "key and value required"),
  value: z.string().trim().min(1, "key and value required"),
});
export const DeleteAttrBody = z.object({
  key: z.string().trim().min(1, "key required"),
});

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
  userId: string,
  entityId: string,
  key: string,
  value: string,
): Promise<boolean> {
  const [owner] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, userId)));
  if (!owner) return false;

  await db
    .insert(attributes)
    .values({
      userId,
      entityId,
      key: key.toLowerCase().replace(/\s+/g, "_"),
      value,
      source: SOURCE_COCKPIT_UI,
    })
    .onConflictDoUpdate({
      target: [attributes.entityId, attributes.key],
      set: { value, updatedAt: new Date() },
    });
  return true;
}

/** Deletes the (entity, key) attribute for the current user. */
export async function deleteEntityAttribute(userId: string, entityId: string, key: string): Promise<void> {
  await db
    .delete(attributes)
    .where(
      and(
        eq(attributes.entityId, entityId),
        eq(attributes.key, key),
        eq(attributes.userId, userId),
      ),
    );
}

/** Verifies the entity belongs to the user before recording an interaction.
 *  Returns the created row, or null if the entity wasn't found (caller should 404). */
export async function createEntityInteraction(
  userId: string,
  entityId: string,
  body: { channel: string; direction: InteractionDirection; summary?: string; occurredAt?: string },
): Promise<Interaction | null> {
  const [owner] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, userId)));
  if (!owner) return null;

  const [created] = await db
    .insert(interactions)
    .values({
      userId,
      entityId,
      channel: body.channel,
      direction: body.direction,
      summary: body.summary || null,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    })
    .returning();
  return created;
}
