// Read-only schema-drift guard.
//
// The Drizzle schema (src/db/schema) is the SSOT for what tables must exist, but
// nothing in the deploy path (deploy-local.sh) runs `drizzle-kit push`. So a new
// table added in code reaches production unmigrated and silently breaks the
// first feature that queries it — exactly how `prompts`, `cron_jobs`, and
// `conversations`/`conversation_messages` went missing and hard-500'd /prompts,
// /loki, and the System cron list.
//
// This check compares the schema's declared table names against the live DB's
// public tables and fails (exit 1) if any are missing — turning a runtime 500
// into a pre-push error. It is strictly READ-ONLY: it never creates, alters, or
// drops anything. If no database is configured (e.g. CI) or the DB is
// unreachable, it prints a skip notice and exits 0 so it never blocks a push for
// infra reasons.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Raw tsx scripts don't get Next.js's automatic env loading, so pull in
// .env.local / .env ourselves. Only fills keys not already in the environment.
function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  // --print: emit the schema-declared table names (one per line) and exit, no
  // DB needed. Lets a remote deploy (deploy-hetzner.sh) compare this list
  // against the BOX database, which the laptop can't reach directly.
  if (process.argv.includes("--print")) {
    const { getTableName, is } = await import("drizzle-orm");
    const { PgTable } = await import("drizzle-orm/pg-core");
    const schema = await import("@/db/schema");
    const names = new Set<string>();
    for (const value of Object.values(schema)) {
      if (is(value, PgTable)) names.add(getTableName(value));
    }
    console.log([...names].sort().join("\n"));
    process.exit(0);
  }

  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  if (!process.env.DATABASE_POOL_URL && !process.env.DATABASE_URL) {
    console.log("→ schema-drift: no DATABASE_URL configured, skipping.");
    process.exit(0);
  }

  // Dynamic imports so the env guard above runs before @/db tries to connect.
  const { getTableName, is, sql } = await import("drizzle-orm");
  const { PgTable } = await import("drizzle-orm/pg-core");
  const schema = await import("@/db/schema");

  const declared = new Set<string>();
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) declared.add(getTableName(value));
  }

  let live: Set<string>;
  try {
    const { db } = await import("@/db");
    const rows = (await db.execute(sql`
      select table_name from information_schema.tables where table_schema = 'public'
    `)) as unknown as Array<{ table_name: string }>;
    live = new Set(rows.map((r) => r.table_name));
  } catch (err) {
    console.log(`→ schema-drift: database unreachable, skipping (${err instanceof Error ? err.message : String(err)})`);
    process.exit(0);
  }

  const missing = [...declared].filter((t) => !live.has(t)).sort();

  if (missing.length > 0) {
    console.error(`✗ schema-drift: ${missing.length} table(s) declared in src/db/schema are MISSING from the database:`);
    for (const t of missing) console.error(`    - ${t}`);
    console.error("  Run `npm run migrate` (drizzle-kit push) to create them before pushing.");
    process.exit(1);
  }

  console.log(`✓ schema-drift: all ${declared.size} declared tables exist in the database.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ schema-drift: check crashed:", err);
  process.exit(1);
});
