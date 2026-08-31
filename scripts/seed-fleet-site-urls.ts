/**
 * One-off: teach the Atlas where the already-deployed fleet sites live.
 *
 * Why a script and not a migration: which host serves which project is DATA
 * about one operator's box, not product schema. Baking it into a migration
 * would ship one person's deployment map to every FleetCrown install.
 *
 * Only fills rows where live_url IS NULL — a URL the user has edited is the
 * SSOT and must never be overwritten by a seed. Safe to re-run.
 *
 * Source of truth for this map: the Caddy vhosts + systemd units on the box
 * (`ls /etc/caddy/apps.d`), read 2026-08-06.
 *
 * Run: DATABASE_URL=... npx tsx scripts/seed-fleet-site-urls.ts [--apply]
 */
import { isNull, and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { userProjects } from "../src/db/schema";

const SITES: Record<string, string> = {
  "aoz-housing": "https://aoz-wohnen.orangecat.ch",
  botsmann: "https://botsmann.orangecat.ch",
  datacat: "https://datacat.orangecat.ch",
  fleetcrown: "https://fleetcrown.orangecat.ch",
  kivvi: "https://kivvi.orangecat.ch",
  orangecat: "https://orangecat.ch",
  petvity: "https://petvity.orangecat.ch",
  printcraft: "https://printcraft.orangecat.ch",
  "reparaturbonus-zh": "https://reparaturbonus.orangecat.ch",
  "revamp-info": "https://revamp-info.orangecat.ch",
  revampit: "https://revampit.orangecat.ch",
  "sbb-lost-found": "https://sbb.orangecat.ch",
  solon: "https://solon.orangecat.ch",
  "surf-your-life": "https://surf-your-life.orangecat.ch",
  vitareba: "https://vitareba.orangecat.ch",
};

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({ id: userProjects.id, name: userProjects.name, liveUrl: userProjects.liveUrl })
    .from(userProjects);

  let filled = 0;
  let skipped = 0;
  const unmatched: string[] = [];

  for (const row of rows) {
    const url = SITES[row.name.toLowerCase()];
    if (!url) {
      if (!row.liveUrl) unmatched.push(row.name);
      continue;
    }
    if (row.liveUrl) {
      skipped++;
      continue;
    }
    console.log(`${apply ? "set" : "would set"} ${row.name} → ${url}`);
    if (apply) {
      await db
        .update(userProjects)
        .set({ liveUrl: url, updatedAt: new Date() })
        .where(and(eq(userProjects.id, row.id), isNull(userProjects.liveUrl)));
    }
    filled++;
  }

  console.log(`\n${filled} filled, ${skipped} already set.`);
  if (unmatched.length) console.log(`No known site (left empty): ${unmatched.join(", ")}`);
  if (!apply) console.log("\nDry run — re-run with --apply to write.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
