/**
 * Drift gate for the mirrored agent/core.
 * Run: npx tsx scripts/test/agent-core-drift.ts
 *
 * The harness is duplicated into OrangeCat rather than packaged (see
 * src/lib/agent/core/README.md). Duplication is only safe if divergence is
 * impossible to commit accidentally — two copies of "what counts as grounded",
 * quietly disagreeing, is a worse failure than the one the harness was built to
 * fix, because it would make the two assistants wrong in different ways.
 *
 * So: SHA-256 per file, compared against the mirror. Any difference fails.
 *
 * SKIPS (exit 0) when OrangeCat is not checked out beside this repo, because CI
 * clones one repo at a time. That means the gate is a LOCAL and pre-push
 * guarantee, not a CI one — the honest boundary, stated rather than implied.
 * The corresponding check on OrangeCat's side is what catches a mirror edited
 * in isolation.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "src", "lib", "agent", "core");
const MIRROR = process.env.ORANGECAT_DIR
  ? join(process.env.ORANGECAT_DIR, "src", "services", "agent-core")
  : join(HERE, "..", "..", "..", "orangecat", "src", "services", "agent-core");

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

if (!existsSync(MIRROR)) {
  console.log(`↷ agent-core drift: OrangeCat mirror not present at ${MIRROR} — skipped`);
  process.exit(0);
}

const srcFiles = readdirSync(SRC).sort();
const mirrorFiles = readdirSync(MIRROR).sort();
const problems: string[] = [];

for (const f of srcFiles) {
  if (!mirrorFiles.includes(f)) {
    problems.push(`missing from mirror: ${f}`);
    continue;
  }
  const a = sha(readFileSync(join(SRC, f), "utf8"));
  const b = sha(readFileSync(join(MIRROR, f), "utf8"));
  if (a !== b) problems.push(`content differs: ${f} (canonical ${a} vs mirror ${b})`);
}
for (const f of mirrorFiles) {
  if (!srcFiles.includes(f)) problems.push(`extra file in mirror (not canonical): ${f}`);
}

if (problems.length > 0) {
  console.error("✗ agent-core drift detected:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("\n  Fix: edit the FleetCrown copy, then run `npm run sync:agent-core`.");
  process.exit(1);
}

console.log(`✓ agent-core drift: ${srcFiles.length} file(s) identical across both repos`);
