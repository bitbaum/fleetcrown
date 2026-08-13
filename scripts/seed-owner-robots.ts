/**
 * Idempotent: upsert the two owner vacuums into a user's robot book.
 *
 *   npx tsx scripts/seed-owner-robots.ts
 *
 * Uses DATABASE_URL. Optional SEED_OWNER_EMAIL picks the user; otherwise
 * the default user (is_default) or the first user.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env.hetzner.local" });

async function main() {
  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { ensureDefaultVacuums } = await import("../src/db/queries/robots");

  const email = process.env.SEED_OWNER_EMAIL;
  const all = await db.select({ id: users.id, email: users.email, isDefault: users.isDefault }).from(users);
  const owner =
    (email ? all.find((u) => u.email === email) : undefined)
    ?? all.find((u) => u.isDefault)
    ?? all[0];
  if (!owner) throw new Error("No users in the database");

  const robots = await ensureDefaultVacuums(owner.id);
  console.log(`seeded ${robots.length} vacuums for ${owner.email ?? owner.id}`);
  for (const r of robots) console.log(`  - ${r.name} (${r.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
