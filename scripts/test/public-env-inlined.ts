/**
 * A NEXT_PUBLIC_* value has TWO origins, and nothing checks they agree.
 *
 * The server reads `process.env.NEXT_PUBLIC_X` at RUNTIME. The browser gets
 * whatever was INLINED into the bundle at BUILD time. Those are different
 * machines at different moments, and when they disagree the same component
 * renders two different trees — which is a hydration failure, in production
 * only, on every page that mounts it.
 *
 * That is not hypothetical. Measured on prod 2026-09-04:
 *   - server-rendered HTML contained the notifications button
 *   - the hydrated DOM contained zero of them
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY appeared in 0 of 17 client chunks (1.1MB)
 *   - React #418 on EVERY authenticated page; zero on public pages; zero in
 *     dev; zero against a local production build
 * The cause: `.github/workflows/deploy.yml`'s build step declares no `env:` at
 * all, so the client bundle is built with every NEXT_PUBLIC_* empty while the
 * box runs with them set.
 *
 * Six other hypotheses were tested and disproved first (the feedback widget,
 * a localStorage read, ThemeToggle, AppShell, HTML caching, and the server's
 * UTC timezone vs the browser's). None of them left a trace a checker could
 * have found. THIS one does, because it is a discrepancy between two files.
 *
 * So compare them: every NEXT_PUBLIC_* the app reads should be handed to the
 * build. Anything not handed over is empty in the browser — silently.
 *
 * Run: npx tsx scripts/test/public-env-inlined.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

/**
 * Vars known to be absent from the build and deliberately not blocking.
 *
 * NOT an excuse list — each entry is a live gap with a consequence, recorded
 * so it is visible in code review instead of in someone's memory. Closing one
 * means adding a repo secret/variable AND passing it in deploy.yml's build
 * step; then delete the entry and this check keeps it closed forever.
 *
 * Deliberately not failing on these today: the fix needs repo secrets that do
 * not exist yet (`gh secret list` shows only HETZNER_SSH_KEY and
 * RELEASES_REPO_TOKEN), and a gate nobody can satisfy is a gate that gets
 * switched off — the same trap as a wrong SKIP reason.
 */
const KNOWN_GAPS: Record<string, string> = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:
    "SET ON THE BOX, absent from the bundle — the one that actually diverges. " +
    "Push notifications are dead in prod: the browser sees an empty key so " +
    "subscribe() cannot run. Closing it needs a repo secret (none exists yet: " +
    "`gh secret list` shows only HETZNER_SSH_KEY and RELEASES_REPO_TOKEN) plus " +
    "an env: entry on deploy.yml's build step.",
  NEXT_PUBLIC_SENTRY_DSN:
    "Intentionally optional — absent means Sentry is disabled, a valid state, " +
    "and the box does not set it either, so both sides agree on empty.",
  NEXT_PUBLIC_ORANGECAT_PROJECT_ID:
    "Declared in .env.example but NOT set on the box (verified 2026-09-04), so " +
    "server and browser both fall back to the same default. Harmless until " +
    "someone sets it in prod — at which point this entry should be closed.",
  NEXT_PUBLIC_FLEETCROWN_ORANGECAT_PROJECT_ID: "Same as NEXT_PUBLIC_ORANGECAT_PROJECT_ID above.",
  NEXT_PUBLIC_ORANGECAT_URL: "Same shape — unset on the box; both sides use the compiled default.",
  NEXT_PUBLIC_FLEETCROWN_URL: "Same shape — unset on the box; both sides use the compiled default.",
  NEXT_PUBLIC_SOLON_URL: "Same shape — unset on the box; both sides use the compiled default.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Which NEXT_PUBLIC_* does the app actually read?
const used = new Set<string>();
for (const file of walk(join(repoRoot, "src"))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) used.add(m[1]);
}
ok(used.size > 0, `found NEXT_PUBLIC_* references in src/ (got ${used.size})`);

/**
 * Which reach the bundle? TWO sources, and missing either gives false alarms.
 *
 * The first draft of this check read only deploy.yml and reported six
 * "unexplained" vars — but NEXT_PUBLIC_BUILD_SHA visibly renders in the live
 * footer, which is exactly the kind of contradiction that means the CHECK is
 * wrong, not the code. next.config.ts has its own `env:` block that inlines
 * values computed at build time. A checker that knows about one mechanism and
 * not the other cries wolf, and a gate that cries wolf gets ignored.
 */
const deployPath = join(repoRoot, ".github/workflows/deploy.yml");
const deploy = readFileSync(deployPath, "utf8");
const buildStep = deploy.slice(deploy.indexOf("Build (app + bridge)"));
const buildBlock = buildStep.slice(0, buildStep.indexOf("- name: SSH setup"));
const fromWorkflow = [...buildBlock.matchAll(/(NEXT_PUBLIC_[A-Z0-9_]+)\s*:/g)].map((m) => m[1]);

const nextConfig = readFileSync(join(repoRoot, "next.config.ts"), "utf8");
const envBlock = nextConfig.slice(nextConfig.indexOf("\n  env: {"));
const fromNextConfig = [
  ...envBlock.slice(0, envBlock.indexOf("},")).matchAll(/(NEXT_PUBLIC_[A-Z0-9_]+)\s*:/g),
].map((m) => m[1]);

const handedToBuild = new Set([...fromWorkflow, ...fromNextConfig]);

/**
 * A var absent from BOTH build and runtime is harmless — both sides fall back
 * to the same default and agree. The divergence only exists when the RUNTIME
 * sets something the BUILD did not inline.
 *
 * Measured on the box 2026-09-04, `/opt/fleetcrown/app/.env` sets exactly one:
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY. Which is precisely the one that broke.
 *
 * CI cannot read the box, so use the repo's own declaration of what a
 * deployment sets: .env.example. Anything listed there is something an
 * operator is expected to configure, so it must also reach the build — or it
 * will differ between server and browser the moment someone sets it.
 *
 * Without this narrowing the check flagged five vars that are set NOWHERE and
 * therefore cannot diverge. A gate that reports harmless things trains people
 * to skim it.
 */
const declaredForRuntime = new Set(
  [
    ...readFileSync(join(repoRoot, ".env.example"), "utf8").matchAll(
      /^\s*#?\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/gm,
    ),
  ].map((m) => m[1]),
);

const missing = [...used]
  .filter((v) => declaredForRuntime.has(v))
  .filter((v) => !handedToBuild.has(v))
  .sort();
const unexplained = missing.filter((v) => !(v in KNOWN_GAPS));

for (const v of unexplained) {
  ok(
    false,
    `${v} is read by src/ but never passed to deploy.yml's build step, so the ` +
      `BROWSER sees "" while the server sees the real value. If a component ` +
      `branches on it, that is a production-only hydration failure on every ` +
      `page that renders it.\n` +
      `    Fix: add it to the "Build (app + bridge)" step's env: from a repo ` +
      `secret/variable. If its absence is genuinely fine, add it to ` +
      `KNOWN_GAPS with the consequence spelled out.`,
  );
}
if (unexplained.length === 0)
  ok(true, "every NEXT_PUBLIC_* read by src/ is either built in or a recorded gap");

// A recorded gap that has since been fixed must be deleted, or the list rots
// into a permanent excuse.
for (const [v, why] of Object.entries(KNOWN_GAPS)) {
  if (!used.has(v)) continue;
  ok(
    !handedToBuild.has(v),
    `${v} is in KNOWN_GAPS but deploy.yml now DOES pass it — delete the entry ` +
      `so the check starts enforcing it. (Recorded reason: ${why})`,
  );
}

console.log(`\nNEXT_PUBLIC_* read by src/: ${[...used].sort().join(", ") || "(none)"}`);
console.log(
  `passed to the build:        ${[...handedToBuild].sort().join(", ") || "(NONE — the build step declares no env:)"}`,
);
if (missing.length > 0) {
  console.log(`\nnot inlined (browser sees ""):`);
  for (const v of missing)
    console.log(`  ${v}${KNOWN_GAPS[v] ? ` — recorded gap: ${KNOWN_GAPS[v]}` : "  ← UNEXPLAINED"}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
