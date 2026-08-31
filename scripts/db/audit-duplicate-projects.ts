import { db } from "../../src/db";
import { entities, userProjects } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { ENTITY_TYPE } from "../../src/lib/constants/statuses";

function groupByUserName<T extends { userId: string; name: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.userId}::${row.name.trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].filter(([, v]) => v.length > 1);
}

async function main() {
  const projects = await db
    .select({ id: entities.id, name: entities.name, userId: entities.userId })
    .from(entities)
    .where(eq(entities.type, ENTITY_TYPE.PROJECT));

  const entityDups = groupByUserName(projects);
  console.log(`entities: ${projects.length} rows, ${entityDups.length} duplicate groups`);
  for (const [key, v] of entityDups) {
    console.log(`  ${key.split("::")[1]} -> ${v.map((x) => x.name).join(" | ")}`);
  }

  const ups = await db
    .select({ id: userProjects.id, name: userProjects.name, userId: userProjects.userId })
    .from(userProjects);

  const upDups = groupByUserName(ups);
  console.log(`user_projects: ${ups.length} rows, ${upDups.length} duplicate groups`);
  for (const [key, v] of upDups) {
    console.log(`  ${key.split("::")[1]} -> ${v.map((x) => x.name).join(" | ")}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
