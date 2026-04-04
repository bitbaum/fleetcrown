import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { entities, entityRelations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function getEntityStats() {
  const result = await db
    .select({
      type: entities.type,
      count: sql<number>`count(*)`,
    })
    .from(entities)
    .where(eq(entities.userId, DEFAULT_USER_ID))
    .groupBy(entities.type)
    .orderBy(sql`count(*) DESC`);

  const [relCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(entityRelations)
    .where(eq(entityRelations.userId, DEFAULT_USER_ID));

  return {
    entityTypes: result,
    totalEntities: result.reduce((sum, r) => sum + Number(r.count), 0),
    totalRelations: Number(relCount.count),
  };
}
