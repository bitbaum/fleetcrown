/** One-off inventory — lists project entities + attr/goal counts. */
import { db } from "../../src/db";
import { entities, attributes, goals, userProjects } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { ENTITY_TYPE } from "../../src/lib/constants/statuses";

async function main() {
  const rows = await db
    .select({ id: entities.id, name: entities.name, userId: entities.userId })
    .from(entities)
    .where(eq(entities.type, ENTITY_TYPE.PROJECT))
    .orderBy(entities.name);

  for (const r of rows) {
    const [ac] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(attributes)
      .where(eq(attributes.entityId, r.id));
    const [gc] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(goals)
      .where(eq(goals.entityId, r.id));
    const up = await db
      .select({ dir: userProjects.dirPath })
      .from(userProjects)
      .where(eq(userProjects.entityProjectId, r.id));
    console.log(
      `${r.name.padEnd(22)} attrs=${String(ac?.c ?? 0).padStart(2)} goals=${String(gc?.c ?? 0).padStart(2)} dir=${up.map((u) => u.dir).filter(Boolean)[0] ?? "-"}`,
    );
  }
  console.log(`\nentities TOTAL ${rows.length}`);

  const ups = await db
    .select({ name: userProjects.name, entityId: userProjects.entityProjectId, dir: userProjects.dirPath })
    .from(userProjects)
    .orderBy(userProjects.name);
  console.log("\nuser_projects:");
  for (const u of ups) {
    console.log(`  ${u.name.padEnd(22)} entity=${u.entityId?.slice(0, 8) ?? "-".padEnd(8)} dir=${u.dir ?? "-"}`);
  }
  console.log(`user_projects TOTAL ${ups.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
