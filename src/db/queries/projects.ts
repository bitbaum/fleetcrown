import { db } from "@/db";
import { entities, attributes } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

const GEORGE_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function getProjects() {
  const projects = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.userId, GEORGE_USER_ID),
        eq(entities.type, "project"),
      ),
    )
    .orderBy(entities.name);

  const projectIds = projects.map((p) => p.id);
  const allAttrs =
    projectIds.length > 0
      ? await db
          .select()
          .from(attributes)
          .where(
            sql`${attributes.entityId} IN (${sql.join(
              projectIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : [];

  const attrsByEntity = new Map<string, Record<string, string>>();
  for (const attr of allAttrs) {
    const existing = attrsByEntity.get(attr.entityId) ?? {};
    existing[attr.key] = attr.value;
    attrsByEntity.set(attr.entityId, existing);
  }

  return projects.map((p) => ({
    ...p,
    attrs: attrsByEntity.get(p.id) ?? {},
  }));
}
