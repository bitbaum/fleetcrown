// Write curated project attributes from a JSON file.
//
// The extractor (scripts/enrich-prod-profiles.ts) is the normal path. This is
// the escape hatch for when the model's budget is exhausted or a field is worth
// writing by hand: same validation, same upsert, same ownership check — the
// only difference is where the text came from.
//
// The JSON is `{ "<project name>": { "<attr key>": "<value>", … }, … }`, keyed
// by entities.name. Keys must exist in PROJECT_ATTR; values are validated by
// the same schema the model output goes through, so nothing can be written here
// that the extractor could not have written.
//
// Usage:
//   npx tsx scripts/apply-project-attrs.ts <file.json>            # dry run
//   npx tsx scripts/apply-project-attrs.ts <file.json> --apply
//
// Env: DB creds from .env.hetzner.local, or AUDIT_DATABASE_URL for a tunnel
// (`eval "$(bash scripts/db-tunnel.sh)"`).
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.hetzner.local" });

const APPLY = process.argv.includes("--apply");
const FILE = process.argv.slice(2).find((a) => !a.startsWith("--"));

async function main() {
  if (!FILE) throw new Error("usage: apply-project-attrs.ts <file.json> [--apply]");

  if (process.env.AUDIT_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.AUDIT_DATABASE_URL;
  } else if (!process.env.DATABASE_URL) {
    const password = process.env.FLEETCROWN_DB_PASSWORD;
    const host = process.env.HETZNER_IP;
    if (!password || !host)
      throw new Error("FLEETCROWN_DB_PASSWORD / HETZNER_IP missing from .env.hetzner.local");
    process.env.DATABASE_URL = `postgres://fleetcrown:${encodeURIComponent(password)}@${host}:5432/fleetcrown?sslmode=require`;
  }

  const { db } = await import("../src/db");
  const { entities } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { ExtractedProfileSchema, applyProjectProfile } = await import("../src/lib/project-brief");

  const input = JSON.parse(readFileSync(FILE, "utf-8")) as Record<string, Record<string, string>>;
  const projects = await db
    .select({ id: entities.id, userId: entities.userId, name: entities.name })
    .from(entities)
    .where(eq(entities.type, "project"));

  let written = 0;
  for (const [name, attrs] of Object.entries(input)) {
    const p = projects.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!p) {
      console.log(`— ${name}: no such project, skipped`);
      continue;
    }

    // Same schema as model output: an unknown key or an over-long value fails
    // here rather than landing in the DB.
    const parsed = ExtractedProfileSchema.strict().safeParse(attrs);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      console.log(`✗ ${name}: ${issue?.path.join(".")} ${issue?.message}`);
      continue;
    }

    console.log(`${APPLY ? "✚" : "DRY"} ${p.name}: ${Object.keys(parsed.data).join(", ")}`);
    if (APPLY) {
      const ok = await applyProjectProfile(p.userId, p.id, parsed.data);
      if (!ok) {
        console.log(`✗ ${p.name}: apply failed`);
        continue;
      }
    }
    written++;
  }

  console.log(`\n${APPLY ? "applied" : "would apply"}: ${written}/${Object.keys(input).length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
