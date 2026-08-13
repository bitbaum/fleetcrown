// Backfill prod project profiles from local repo docs.
//
// The user's repos already say what each project is — the FleetCrown profiles
// shouldn't be emptier than the repos. This script runs the same extraction
// pipeline as POST /api/projects/[id]/brief, but sourced from local docs and
// pointed at the production (Hetzner) database. Sources per project, each
// included when present: ~/dev/<project>/README.md, ~/dev/<project>/CLAUDE.md,
// ~/dev/bitbaum/projects/<project>.md (operator notes), and the newest
// gtm*.md under ~/dev/<project>/docs/ (recursive, case-insensitive).
//
// Usage:
//   npx tsx scripts/enrich-prod-profiles.ts                       # dry run (no writes)
//   npx tsx scripts/enrich-prod-profiles.ts --apply               # write to prod
//   npx tsx scripts/enrich-prod-profiles.ts --apply --update-gtm  # write ONLY the
//       distribution + gtm attrs — safe on already-filled projects, nothing
//       else is touched
//
// Env: GROQ_API_KEY from .env.local; DB password from .env.hetzner.local.
// Description is only set when currently empty — attrs are upserted (that's
// the point of the backfill). Existing attr keys outside the profile set are
// never touched.
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.hetzner.local" });

const APPLY = process.argv.includes("--apply");
// Restrict writes to the distribution + gtm attrs. Projects enriched before
// those keys existed are "full" everywhere else — this backfills just the new
// context without re-deciding any other field.
const UPDATE_GTM = process.argv.includes("--update-gtm");
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

function readDoc(path: string): string | null {
  try { return readFileSync(path, "utf-8").slice(0, 8000); } catch { return null; }
}

/** ~/dev/bitbaum/projects/<name>.md — the operator's per-project notes. */
function bitbaumNotePath(name: string): string | null {
  const notesDir = join(DEV_ROOT, "bitbaum", "projects");
  if (!existsSync(notesDir)) return null;
  const target = `${(NAME_TO_DIR_OVERRIDES[name.toLowerCase()] ?? name).toLowerCase()}.md`;
  try {
    const hit = readdirSync(notesDir).find((f) => f.toLowerCase() === target);
    return hit ? join(notesDir, hit) : null;
  } catch { return null; }
}

/** Newest gtm*.md anywhere under <dir>/docs — covers docs/GTM.md,
 *  docs/gtm-plan.md, docs/strategy/gtm.md. Newest wins when several exist. */
function newestGtmDocPath(dir: string): string | null {
  const docsDir = join(dir, "docs");
  if (!existsSync(docsDir)) return null;
  try {
    const hits = (readdirSync(docsDir, { recursive: true }) as string[])
      .filter((f) => typeof f === "string" && /^gtm.*\.md$/i.test(basename(f)))
      .map((f) => join(docsDir, f))
      .flatMap((p) => {
        try { return [{ path: p, mtimeMs: statSync(p).mtimeMs }]; } catch { return []; }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return hits[0]?.path ?? null;
  } catch { return null; }
}

/** All available docs for a project, labeled so extraction sees provenance. */
function collectSources(name: string, dir: string): Array<{ label: string; text: string }> {
  const candidates: Array<{ label: string; path: string }> = [
    { label: "README.md", path: join(dir, "README.md") },
    { label: "CLAUDE.md", path: join(dir, "CLAUDE.md") },
  ];
  const note = bitbaumNotePath(name);
  if (note) candidates.push({ label: `bitbaum/projects/${basename(note)}`, path: note });
  const gtm = newestGtmDocPath(dir);
  if (gtm) candidates.push({ label: `docs/…/${basename(gtm)}`, path: gtm });

  return candidates.flatMap(({ label, path }) => {
    if (!existsSync(path)) return [];
    const text = readDoc(path);
    return text ? [{ label, text }] : [];
  });
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
    const sources = collectSources(p.name, dir);
    if (!sources.length) { console.log(`— ${p.name}: no docs found for ${dir}, skipped`); continue; }
    const docs = sources.map((s) => `### SOURCE: ${s.label}\n\n${s.text}`).join("\n\n---\n\n");
    console.log(`  ${p.name} sources: ${sources.map((s) => s.label).join(" + ")}`);

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
    // --update-gtm: only the two new attrs may be written — everything else
    // the extractor produced is discarded before it can touch a filled profile.
    if (UPDATE_GTM) {
      profile = {
        ...(profile.distribution ? { distribution: profile.distribution } : {}),
        ...(profile.gtm ? { gtm: profile.gtm } : {}),
      };
    }
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
