// Backfill prod project profiles from local repo docs (README.md + CLAUDE.md).
//
// The user's repos already say what each project is — the FleetCrown profiles
// shouldn't be emptier than the repos. This script runs the same extraction
// pipeline as POST /api/projects/[id]/brief, but sourced from ~/dev/<project>
// docs and pointed at the production (Hetzner) database.
//
// Usage:
//   npx tsx scripts/enrich-prod-profiles.ts            # dry run (no writes)
//   npx tsx scripts/enrich-prod-profiles.ts --apply    # write to prod
//
// Env: GROQ_API_KEY from .env.local; DB password from .env.hetzner.local.
// Description is only set when currently empty — attrs are upserted (that's
// the point of the backfill). Existing attr keys outside the profile set are
// never touched.
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.hetzner.local" });

const APPLY = process.argv.includes("--apply");
// Optional positional args narrow the run to specific project names
// (e.g. retrying transient extraction failures).
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());
const DEV_ROOT = join(homedir(), "dev");

// entities.name (prod) → local repo dir under ~/dev. Identity-cased names
// are matched case-insensitively against ~/dev automatically; this map only
// covers genuinely different names.
const NAME_TO_DIR_OVERRIDES: Record<string, string> = {
  "revamp-it": "revampit",
  bitbaum: "bitbaum",
};

const PLACEHOLDER_DESCRIPTION = /^local repository imported from/i;

function isPlaceholderDescription(description: string | null | undefined): boolean {
  const t = description?.trim();
  return !t || PLACEHOLDER_DESCRIPTION.test(t);
}

function localDirFor(name: string): string | null {
  const dirs = readdirSync(DEV_ROOT);
  const target = (NAME_TO_DIR_OVERRIDES[name.toLowerCase()] ?? name).toLowerCase();
  const hit = dirs.find((d) => d.toLowerCase() === target);
  return hit ? join(DEV_ROOT, hit) : null;
}

function repoDocs(dir: string): string | null {
  const parts: string[] = [];
  for (const f of ["README.md", "CLAUDE.md"]) {
    const p = join(dir, f);
    if (existsSync(p)) {
      try { parts.push(readFileSync(p, "utf-8").slice(0, 8000)); } catch { /* unreadable */ }
    }
  }
  return parts.length ? parts.join("\n\n---\n\n") : null;
}

async function main() {
  const password = process.env.FLEETCROWN_DB_PASSWORD;
  const host = process.env.HETZNER_IP;
  if (!password || !host) throw new Error("FLEETCROWN_DB_PASSWORD / HETZNER_IP missing from .env.hetzner.local");
  // Point the app's db module at prod BEFORE importing it.
  process.env.DATABASE_URL = `postgres://fleetcrown:${encodeURIComponent(password)}@${host}:5432/fleetcrown?sslmode=require`;

  const { db } = await import("../src/db");
  const { entities, users } = await import("../src/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { extractProjectProfile, applyProjectProfile } = await import("../src/lib/project-brief");

  const allUsers = await db.select({ id: users.id, email: users.email, name: users.name }).from(users);
  console.log(`prod users: ${allUsers.map((u) => `${u.name ?? "?"} <${u.email ?? "?"}>`).join(" · ")}`);

  const projects = await db
    .select({ id: entities.id, userId: entities.userId, name: entities.name, description: entities.description })
    .from(entities)
    .where(eq(entities.type, "project"));
  console.log(`prod projects: ${projects.length}\n`);

  let enriched = 0;
  for (const p of projects) {
    if (ONLY.length && !ONLY.includes(p.name.toLowerCase())) continue;
    const dir = localDirFor(p.name);
    if (!dir) { console.log(`— ${p.name}: no local repo match, skipped`); continue; }
    const docs = repoDocs(dir);
    if (!docs) { console.log(`— ${p.name}: no README/CLAUDE.md in ${dir}, skipped`); continue; }

    await new Promise((r) => setTimeout(r, 8000)); // pace every Groq call, success or not

    let profile;
    for (let attempt = 0; ; attempt++) {
      try {
        profile = await extractProjectProfile(p.name, docs);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const transient = msg.includes("fetch failed") || msg.includes("429") || msg.includes("groq 5");
        if (!transient || attempt >= 2) {
          console.log(`✗ ${p.name}: extraction failed (${msg})`);
          profile = undefined;
          break;
        }
        console.log(`… ${p.name}: retrying after transient Groq error (${msg})`);
        await new Promise((r) => setTimeout(r, 25_000));
      }
    }
    if (!profile) continue;
    // Keep a human-written description; replace import placeholders.
    if (p.description?.trim() && !isPlaceholderDescription(p.description)) {
      delete profile.description;
    }

    const fields = Object.entries(profile).filter(([, v]) => v);
    if (!fields.length) { console.log(`— ${p.name}: nothing extracted, skipped`); continue; }

    console.log(`${APPLY ? "✚" : "DRY"} ${p.name} (${dir.split("/").pop()}):`);
    for (const [k, v] of fields) console.log(`    ${k} = ${String(v).slice(0, 100)}`);

    if (APPLY) {
      const applied = await applyProjectProfile(p.userId, p.id, profile);
      if (!applied) { console.log(`✗ ${p.name}: apply failed`); continue; }
    }
    enriched++;
  }

  console.log(`\n${APPLY ? "applied" : "would apply"}: ${enriched}/${projects.length} projects`);
  // entities.userId ownership is enforced inside applyProjectProfile; nothing
  // is written for users other than each entity's owner.
  void and;
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
