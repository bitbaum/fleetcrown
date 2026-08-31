/**
 * Retire obsolete project entities on prod (or any DATABASE_URL target).
 *
 * SSOT for explicit renames/merges and pure deletes — case-insensitive dupes
 * are handled separately by merge-duplicate-projects.ts.
 *
 * Usage:
 *   npx tsx scripts/db/retire-stale-projects.ts            # dry run
 *   npx tsx scripts/db/retire-stale-projects.ts --apply    # execute
 *
 * Env: FLEETCROWN_DB_PASSWORD + HETZNER_IP from .env.hetzner.local (same as enrich-prod-profiles).
 */
import { config } from "dotenv";

config({ path: ".env.hetzner.local" });

const APPLY = process.argv.includes("--apply");

/** loser → winner (loser entity deleted; attrs/goals repointed). */
const MERGE_PAIRS: Array<{ winner: string; loser: string; reason: string }> = [
  {
    winner: "fleetcrown",
    loser: "Cockpit",
    reason: "Cockpit renamed to FleetCrown — same product",
  },
  { winner: "aoz-housing", loser: "AOZ", reason: "Empty duplicate shell" },
  { winner: "surf-your-life", loser: "SYL", reason: "Empty duplicate shell" },
  {
    winner: "surf-your-life",
    loser: "swiss-longevity-hub",
    reason: "Renamed to Surf Your Life — stale SLH repo retired",
  },
  { winner: "ivy-portal", loser: "Ivy", reason: "Empty duplicate shell" },
  {
    winner: "revampit",
    loser: "revamp-it",
    reason: "Duplicate; revampit has dir_path + richer profile",
  },
  {
    winner: "truthseeker",
    loser: "truthseeker-tmp",
    reason: "Import stub superseded by truthseeker",
  },
];

/** Pure delete — no canonical merge target worth keeping. */
const DELETE_NAMES: Array<{ name: string; reason: string }> = [
  { name: "dotfiles", reason: "Infra repo, not a fleet project (was part of Cockpit era)" },
  { name: "kivitendo-erp", reason: "Stale import placeholder; kivvi is canonical" },
  { name: "Catomean", reason: "Empty idea stub (3 attrs, no dir)" },
  { name: "FitFoot", reason: "Empty idea stub (2 attrs, no dir)" },
  { name: "Hirnli", reason: "Empty idea stub (5 attrs, no dir)" },
  { name: "Warbuffet", reason: "Empty idea stub (0 attrs, no dir)" },
  { name: "OpenClaw", reason: "Empty idea stub (0 attrs, no dir)" },
];

async function main() {
  const password = process.env.FLEETCROWN_DB_PASSWORD;
  const host = process.env.HETZNER_IP;
  if (!password || !host)
    throw new Error("FLEETCROWN_DB_PASSWORD / HETZNER_IP missing from .env.hetzner.local");
  process.env.DATABASE_URL = `postgres://fleetcrown:${encodeURIComponent(password)}@${host}:5432/fleetcrown?sslmode=require`;

  const { db } = await import("../../src/db");
  const { entities, users } = await import("../../src/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { ENTITY_TYPE } = await import("../../src/lib/constants/statuses");
  const { findProjectEntityByName, retireProjectMerge, deleteProjectEntityByName } =
    await import("../../src/db/queries/project-merge");

  const allUsers = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users);
  const projectOwners = await db
    .select({ userId: entities.userId, count: sql<number>`count(*)::int` })
    .from(entities)
    .where(eq(entities.type, ENTITY_TYPE.PROJECT))
    .groupBy(entities.userId);

  const ownerCounts = new Map(projectOwners.map((r) => [r.userId, r.count]));
  const ownerUser = allUsers
    .filter((u) => (ownerCounts.get(u.id) ?? 0) > 0)
    .sort((a, b) => (ownerCounts.get(b.id) ?? 0) - (ownerCounts.get(a.id) ?? 0))[0];

  if (!ownerUser) throw new Error("No project entities found in database");
  const userId = ownerUser.id;

  const before = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.type, ENTITY_TYPE.PROJECT));
  console.log(
    `${APPLY ? "Applying" : "Dry run"} retire-stale-projects for ${ownerUser.name ?? ownerUser.email} (${ownerCounts.get(userId)} projects)`,
  );
  console.log(`Project entities before: ${before.length}\n`);

  let merged = 0;
  for (const pair of MERGE_PAIRS) {
    const winner = await findProjectEntityByName(userId, pair.winner);
    const loser = await findProjectEntityByName(userId, pair.loser);
    if (!loser) {
      console.log(`— skip merge ${pair.loser} → ${pair.winner}: loser not found`);
      continue;
    }
    if (!winner) {
      console.log(`✗ skip merge ${pair.loser} → ${pair.winner}: winner not found`);
      continue;
    }
    console.log(`${APPLY ? "✚" : "DRY"} merge ${pair.loser} → ${pair.winner} — ${pair.reason}`);
    if (APPLY) {
      await retireProjectMerge(userId, pair.winner, pair.loser);
      console.log(`   merged (${loser.id.slice(0, 8)} → ${winner.id.slice(0, 8)})`);
    }
    merged++;
  }

  let deleted = 0;
  for (const item of DELETE_NAMES) {
    const row = await findProjectEntityByName(userId, item.name);
    if (!row) {
      console.log(`— skip delete ${item.name}: not found`);
      continue;
    }
    console.log(`${APPLY ? "✚" : "DRY"} delete ${item.name} — ${item.reason}`);
    if (APPLY) {
      const result = await deleteProjectEntityByName(userId, item.name);
      console.log(`   deleted entity ${result.id.slice(0, 8)}`);
    }
    deleted++;
  }

  const after = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.type, ENTITY_TYPE.PROJECT));
  console.log(`\n${APPLY ? "Applied" : "Would apply"}: ${merged} merge(s), ${deleted} delete(s)`);
  console.log(`Project entities after: ${after.length} (${before.length - after.length} removed)`);
  if (!APPLY) console.log("Re-run with --apply to write changes.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
