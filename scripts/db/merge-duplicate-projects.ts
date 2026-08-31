/**
 * Merge case-insensitive duplicate project entities for one or all users.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/db/merge-duplicate-projects.ts          # dry run
 *   DATABASE_URL=... npx tsx scripts/db/merge-duplicate-projects.ts --apply  # execute
 */
import {
  mergeAllDuplicateProjectEntities,
  findDuplicateProjectEntityGroups,
} from "../../src/db/queries/project-merge";

async function main() {
  const apply = process.argv.includes("--apply");
  const userArg = process.argv.find((a) => a.startsWith("--user="));
  const userId = userArg?.slice("--user=".length);

  const groups = await findDuplicateProjectEntityGroups(userId);
  console.log(`${apply ? "Applying" : "Dry run"} — ${groups.length} duplicate group(s)`);
  for (const g of groups) {
    console.log(
      `• ${g.nameKey}: keep ${g.winner.name} (${g.winner.id}), drop ${g.losers.map((l) => l.name).join(", ")}`,
    );
  }

  if (groups.length === 0) {
    console.log("Nothing to merge.");
    return;
  }

  const result = await mergeAllDuplicateProjectEntities({ dryRun: !apply, userId });
  console.log(`Done: ${result.groups} groups, ${result.merged} merge(s).`);
  if (!apply) console.log("Re-run with --apply to write changes.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
