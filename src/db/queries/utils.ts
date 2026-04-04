import { db } from "@/db";
import { attributes } from "@/db/schema";
import { sql } from "drizzle-orm";

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
