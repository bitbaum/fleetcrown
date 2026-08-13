/**
 * Push the canonical agent/core into OrangeCat's mirror.
 * Run: npx tsx scripts/sync-agent-core.ts   (npm run sync:agent-core)
 *
 * FleetCrown owns the canonical copy; OrangeCat mirrors it byte-for-byte. See
 * src/lib/agent/core/README.md for why the harness is duplicated rather than
 * packaged, and scripts/test/agent-core-drift.ts for the check that makes the
 * duplication safe.
 *
 * Deliberately a no-op when the sibling repo is absent — CI clones one repo at
 * a time, and a sync script that fails there would block every unrelated build.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "lib", "agent", "core");
const DEST = process.env.ORANGECAT_DIR
  ? join(process.env.ORANGECAT_DIR, "src", "services", "agent-core")
  : join(HERE, "..", "..", "orangecat", "src", "services", "agent-core");

if (!existsSync(dirname(dirname(DEST)))) {
  console.log(`↷ OrangeCat not found at ${DEST} — skipping mirror (set ORANGECAT_DIR to override)`);
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });

let changed = 0;
for (const file of readdirSync(SRC).sort()) {
  const body = readFileSync(join(SRC, file), "utf8");
  const target = join(DEST, file);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current === body) continue;
  writeFileSync(target, body);
  console.log(`  → ${file}`);
  changed++;
}

console.log(changed === 0 ? "✓ agent-core mirror already in sync" : `✓ mirrored ${changed} file(s) to ${DEST}`);
