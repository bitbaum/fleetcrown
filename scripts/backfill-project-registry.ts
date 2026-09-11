#!/usr/bin/env -S npx tsx
/**
 * backfill-project-registry — give every existing project its canonical slug
 * and its apps.conf link, once.
 *
 * `slug` = the repository name (from git_url), else the display name folded
 * through the alias table. `hosted_app` = the apps.conf row whose canonical
 * slug matches. Never overwrites a value already set; prints what it would do
 * with --dry-run. Runs where the production database is reachable (the box).
 *
 *   DATABASE_URL=… npx tsx scripts/backfill-project-registry.ts [--dry-run]
 */
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { userProjects } from "@/db/schema/user-projects";
import { readAppsConf } from "@/lib/register/apps-conf";
import { canonicalSlug, repoFromGitUrl } from "@/lib/register/build";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const apps = readAppsConf();
  const hostedBySlug = new Map(apps.map((a) => [canonicalSlug(a.name), a.name]));

  const rows = await db
    .select({
      id: userProjects.id,
      name: userProjects.name,
      gitUrl: userProjects.gitUrl,
      slug: userProjects.slug,
      hostedApp: userProjects.hostedApp,
    })
    .from(userProjects)
    .where(and(isNull(userProjects.slug)));

  let updated = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const slug = canonicalSlug(repoFromGitUrl(r.gitUrl) || r.name);
    if (seen.has(slug)) {
      console.warn(`skip ${r.name}: slug "${slug}" already assigned this run — resolve by hand`);
      continue;
    }
    seen.add(slug);
    const hostedApp = r.hostedApp ?? hostedBySlug.get(slug) ?? null;
    console.log(
      `${dry ? "would set" : "set"}  ${r.name.padEnd(34)} slug=${slug.padEnd(24)} hosted_app=${hostedApp ?? "-"}`,
    );
    if (!dry) {
      await db.update(userProjects).set({ slug, hostedApp }).where(eq(userProjects.id, r.id));
      updated++;
    }
  }
  console.log(`${dry ? "dry-run: " : ""}${rows.length} without slug, ${updated} updated`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
