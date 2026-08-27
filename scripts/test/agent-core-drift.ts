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
 *
 * READS THE MIRROR FROM OrangeCat's origin/main, not from its working tree.
 * The working tree is checked out to whatever branch someone happens to be
 * working on there, so a tree-based comparison answers a question nobody
 * asked — "does my canonical match a sibling repo's in-progress feature
 * branch?" — and goes red for reasons that have nothing to do with the commit
 * being pushed. On 2026-08-25 the mirror was resynced and MERGED to OrangeCat
 * main, and this gate still blocked every FleetCrown push on the machine,
 * because the OrangeCat checkout sat on an unrelated branch cut before it.
 *
 * A gate that stays red about code that is fine is worse than no gate: the
 * only way past it is --no-verify, which disables the checks that do work.
 * origin/main is what "the mirror" actually means — the shared branch both
 * repos deploy from — and it is also what the fix (`npm run sync:agent-core`,
 * commit, merge) actually updates.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "src", "lib", "agent", "core");
const OC_REPO = process.env.ORANGECAT_DIR
  ?? join(HERE, "..", "..", "..", "orangecat");
const MIRROR_PATH = "src/services/agent-core";
const REF = process.env.ORANGECAT_REF ?? "origin/main";


/**
 * Did THIS branch touch the canonical agent-core files?
 *
 * Drift can arise two ways: you changed canonical and did not sync, or somebody
 * changed the mirror in the other repository. Only the first is your diff. The
 * second is ambient — it was already true before you started, and blocking your
 * push on it is how a gate teaches people to pass --no-verify.
 *
 * So: your change → fail. Somebody else's → warn and let the push through, with
 * the fix printed. `desktop-release-drift` already works this way, which is why
 * it is the one check in this suite that has never blocked an unrelated push.
 */
function branchTouchedCanonical(): boolean {
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    return changed.split("\n").some(f => f.startsWith("src/lib/agent/core/"));
  } catch {
    // Cannot tell — assume it is yours. A gate that cannot establish innocence
    // should not grant it.
    return true;
  }
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

if (!existsSync(join(OC_REPO, ".git"))) {
  console.log(`↷ agent-core drift: OrangeCat not checked out at ${OC_REPO} — skipped`);
  process.exit(0);
}

const git = (...args: string[]) =>
  execFileSync("git", ["-C", OC_REPO, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

// A missing ref is an infrastructure fact (shallow clone, no fetch yet), not a
// verdict about the code — skip rather than block, same as a missing checkout.
let mirrorFiles: string[];
try {
  mirrorFiles = git("ls-tree", "--name-only", `${REF}:${MIRROR_PATH}`)
    .split("\n")
    .filter(Boolean)
    .sort();
} catch {
  console.log(`↷ agent-core drift: ${REF} unavailable in ${OC_REPO} — skipped (run \`git fetch\` there)`);
  process.exit(0);
}

const srcFiles = readdirSync(SRC).sort();
const problems: string[] = [];

for (const f of srcFiles) {
  if (!mirrorFiles.includes(f)) {
    problems.push(`missing from mirror: ${f}`);
    continue;
  }
  const a = sha(readFileSync(join(SRC, f), "utf8"));
  const b = sha(git("show", `${REF}:${MIRROR_PATH}/${f}`));
  if (a !== b) problems.push(`content differs: ${f} (canonical ${a} vs mirror ${b})`);
}
for (const f of mirrorFiles) {
  if (!srcFiles.includes(f)) problems.push(`extra file in mirror (not canonical): ${f}`);
}

if (problems.length > 0) {
  const yours = branchTouchedCanonical();
  if (!yours) {
    console.warn("⚠ agent-core drift detected, but this branch did not touch src/lib/agent/core/ —");
    console.warn("  the mirror moved in OrangeCat, not here. Not blocking your push.");
    for (const p of problems) console.warn(`    ${p}`);
    console.warn("  Fix separately: npm run sync:agent-core, then merge that in OrangeCat.");
    process.exit(0);
  }

  console.error("✗ agent-core drift detected:");
  for (const p of problems) console.error(`    ${p}`);
  console.error(
    "\n  Fix: edit the FleetCrown copy, run `npm run sync:agent-core`, then commit\n" +
      `  and merge that change in OrangeCat — this compares against ${REF}, not a\n` +
      "  working tree, so an unmerged local sync will not clear it.",
  );
  process.exit(1);
}

console.log(
  `✓ agent-core drift: ${srcFiles.length} file(s) identical between this repo and OrangeCat ${REF}`,
);
