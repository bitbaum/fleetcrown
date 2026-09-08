/**
 * A value exported from src/db/queries/, src/config/ or src/lib/ that NOTHING
 * references.
 *
 * WHY THIS EXISTS
 *
 * Dead exports here are not clutter, they are misinformation. Three shipped
 * examples, all found by hand:
 *
 *   markAgentMessageRead  — the ONLY writer of `read: true`, never called, so
 *                           the Control escalation banner could never be
 *                           cleared and was permanent by construction (#507).
 *   closeStaleAgentTurns  — never scheduled, while its own docblock promises
 *                           the table "does not accumulate rows that look open
 *                           forever". The comment asserts a guarantee nothing
 *                           provides.
 *   EXECUTOR_COPY.loki.*  — eight unread keys inside a file headed "SSOT for
 *                           user-facing execution copy". Editing them changes
 *                           nothing on screen.
 *
 * A config value read in zero places, or a query with no caller, reads to the
 * next person as a working part of the system. That is worse than absence.
 *
 * A RATCHET, NOT A PURGE. The current set is recorded in BASELINE below. New
 * dead exports fail; the existing ones are visible and can be worked down.
 * Removing one and forgetting the list is also caught: a BASELINE entry that is
 * no longer dead fails too, so the list cannot rot into a lie.
 *
 * SCOPE. These three directories only, deliberately. They are the places where
 * a name is almost always referenced statically, so "no references" really does
 * mean dead. Route handlers are excluded because they are addressed by URL —
 * an earlier scan of mine called nine /api/crons/* routes dead when systemd
 * timers on the box invoke them, which a repo-wide grep cannot see. Components
 * are excluded because a sweep already proved none are unrendered.
 *
 * WHY A GATE AND NOT A REPORT. docs/AUDIT_REPORT_2026-07-13.md names four dead
 * exports. Two months later three of the four were still there, and one of them
 * (renderPromptBody) is in this file's BASELINE — a report is read once, a gate
 * is read on every push.
 *
 * Run: npx tsx scripts/test/dead-exports-ratchet.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

/**
 * Known dead exports, each with the consequence of it being dead.
 *
 * To remove an entry: delete the export, then delete the line. To add one you
 * need a reason a reader would accept — "it will be used later" is what every
 * one of these said.
 */
const BASELINE: Record<string, string> = {
  enqueueHostedAnalyzeCommand:
    "Hosted read-only analyze/plan/review cannot be requested. Only hosted DISPATCH is wired " +
    "(lib/inject-core.ts, lib/hosted-runner/dispatch.ts), so Phase 0 exists as a command type " +
    "the runner would handle and nothing can produce.",
  enqueueImport:
    "Importing works, but not the way config/book.ts describes it. That file calls import " +
    "'accept/discard of a file the user handed us', and this is the half that builds the " +
    "accept/discard drafts: it matches each contact against the book and proposes an " +
    "IMPORT_PERSON action for the ones it cannot place. execute-action.ts still HANDLES that " +
    "action type, so the reviewing half is live with nothing feeding it — /api/people/import " +
    "and the OpenClaw sync both call applyImportedBook and write contacts straight in. Whether " +
    "review was dropped deliberately or never wired is a product call, not a deletion.",
  getUserProjectByOrangeCatProjectId:
    "The FC->OC reverse lookup has no caller, so an OrangeCat webhook that identifies a project " +
    "(not an operator) has no way to find which FleetCrown project owns it.",
};

/**
 * Exports that are CORRECT with no reference, and must never be "worked down".
 *
 * Kept apart from BASELINE on purpose. BASELINE is debt whose whole point is to
 * shrink; folding a permanent entry into it would make the number lie and would
 * eventually pressure someone into deleting a working check.
 */
const INTENTIONALLY_UNREFERENCED: Record<string, string> = {
  OUTCOMES_MATCH_DB_SCHEMA:
    "A compile-time drift guard: its TYPE fails to check if lib/events.ts's OUTCOMES and the " +
    "DB schema's outcome union ever diverge. The runtime value is inert by design, so having " +
    "no reader is what a working assertion looks like. Deleting it would delete the check.",
};

/** Directories whose exports are checked. */
const WATCHED = ["src/db/queries", "src/config", "src/lib"];

/** Everything that can legitimately reference a name. */
const SEARCH_ROOTS = ["src", "scripts", "home", "desktop", "widget", ".github", "docs"];
const SEARCH_EXT = /\.(ts|tsx|mjs|cjs|js|jsx|json|md|sh|yml|yaml)$/;
const SKIP_DIR = new Set(["node_modules", ".next", ".git", ".turbo"]);

/**
 * Compiled output, skipped so a build artifact cannot vouch for its own source
 * (see the public/widget.js note below). Matched by PATH, not by name: `build`
 * and `dist` are also ordinary words, and matching the bare name skipped
 * `src/app/integrations/orangecat/build/` — a real App Router route segment.
 * Every export whose only caller lived on that page therefore read as dead, so
 * the check reported a lie about a page that ships.
 */
const SKIP_OUTPUT_PATH = /^(?:[^/]+\/)?(?:dist|build)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    if (SKIP_OUTPUT_PATH.test(relative(repoRoot, full))) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (SEARCH_EXT.test(entry)) out.push(full);
  }
  return out;
}

// ── One pass over the repo: which identifiers does each file mention? ─────────
const files = SEARCH_ROOTS.flatMap((r) => walk(join(repoRoot, r)));
/** identifier -> set of files that mention it */
const mentions = new Map<string, Set<string>>();
for (const file of files) {
  // public/widget.js is a build artifact of widget/main.ts; counting it would
  // make every widget export look referenced by its own compiled copy.
  if (file.endsWith("public/widget.js")) continue;
  // Prose is not a caller. A doc that names a symbol is the strongest reason to
  // suspect it is dead, not evidence it is alive — three exports were hidden
  // behind exactly that (renderPromptBody, MARKETING_SUBTITLE, PRODUCT_NAME).
  // Shell and workflow files stay in: those really can invoke something.
  if (file.endsWith(".md")) continue;
  // THIS file. It names dead exports twice — in BASELINE's keys and in the
  // docblock's worked examples — and an index that counts those makes every
  // baselined name look alive, which reported "0 dead" over five that were.
  // The check would have gone permanently green by writing its own excuse.
  if (file === fileURLToPath(import.meta.url)) continue;
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const m of src.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    let set = mentions.get(m[0]);
    if (!set) mentions.set(m[0], (set = new Set()));
    set.add(file);
  }
}

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

ok(files.length > 500, `indexed the repo (${files.length} files)`);

// The skip list decides what counts as a caller, so a too-greedy entry makes
// live exports read as dead. Assert against the INDEX, not just the pattern:
// the first version of this check tested the regex alone and stayed green
// while the call site still matched on the bare directory name.
ok(
  files.some((f) => /(?:^|\/)(?:build|dist)\//.test(relative(repoRoot, f))),
  "indexes source under nested build/ and dist/ route segments",
);
ok(
  SKIP_OUTPUT_PATH.test("dist") && SKIP_OUTPUT_PATH.test("desktop/dist"),
  "still skips compiled output at a root",
);

/**
 * Exported VALUES only. `export type` / `export interface` are excluded: a type
 * used solely in an annotation is normal and would drown the signal — an
 * earlier sweep counted ~440 of them against 51 real findings.
 */
const EXPORT_RE =
  /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;

/**
 * Two different faults, and conflating them gets something deleted that is
 * still in use.
 *
 *   DEAD          — no reference anywhere, including its own file. Nothing runs
 *                   it; removing the value is safe.
 *   OVER-EXPORTED — used inside its own file but nowhere else. The VALUE is
 *                   live; only the `export` is surplus. Deleting the value
 *                   breaks the file.
 *
 * `PRODUCT_SURFACES` in config/marketing-content.ts is the second kind — line
 * 599 builds `HOME_PRODUCT_SURFACES` from it. An earlier version of this check
 * called it dead, which would have been a real regression. Only the first kind
 * is ratcheted; the second is reported quietly because it is tidiness, not a
 * lie about what the system does.
 */
const allDead: Array<{ name: string; file: string }> = [];
const overExported: Array<{ name: string; file: string }> = [];
/**
 * Per file, the exports that ARE used elsewhere — printed beside every finding.
 *
 * This exists because of a specific mistake, made three times in one sitting
 * while writing the BASELINE below. Each reason claimed a feature was
 * impossible ("nothing adds a member to an org", "the DoD bar is never read",
 * "no dead upgrade path is detected") and each was FALSE: a live sibling in the
 * same file already did the job — getProjectGoalConfig returned the DoD, the
 * invite flow inserted the membership, /pricing gated per plan. The dead export
 * was redundant, not evidence of a gap.
 *
 * "This symbol is unreferenced" and "this capability is missing" are different
 * claims, and the first does not imply the second. Showing the live neighbours
 * puts the refutation next to the finding, where it gets read.
 */
const liveSiblings = new Map<string, string[]>();
for (const dir of WATCHED) {
  for (const file of walk(join(repoRoot, dir))) {
    if (!/\.tsx?$/.test(file)) continue;
    const src = readFileSync(file, "utf8");
    const rel = relative(repoRoot, file);
    for (const m of src.matchAll(EXPORT_RE)) {
      const name = m[1];
      const seen = mentions.get(name);
      const elsewhere = seen ? [...seen].filter((f) => f !== file) : [];
      if (elsewhere.length > 0) {
        const list = liveSiblings.get(rel) ?? [];
        list.push(name);
        liveSiblings.set(rel, list);
        continue;
      }
      // More than one occurrence in its own file means the definition plus at
      // least one use.
      const ownFileUses = (src.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
      const entry = { name, file: rel };
      if (ownFileUses > 1) overExported.push(entry);
      else allDead.push(entry);
    }
  }
}

/** "also here, and used: a, b, c" — or a note that nothing in the file is. */
function siblingNote(file: string): string {
  const live = liveSiblings.get(file) ?? [];
  if (live.length === 0)
    return "      no export in this file is used anywhere — check the FILE, not the symbol.";
  const shown = live.slice(0, 6).join(", ");
  const more = live.length > 6 ? `, +${live.length - 6} more` : "";
  return `      live in the same file: ${shown}${more}  <- does one already do this job?`;
}

const intentional = new Set(Object.keys(INTENTIONALLY_UNREFERENCED));
// Correct-with-no-reference is not debt, so it leaves the list entirely rather
// than being counted and then excused.
const dead = allDead.filter((d) => !intentional.has(d.name));
const deadNames = new Set(dead.map((d) => d.name));
const baselineNames = new Set(Object.keys(BASELINE));

// A name cannot be both permanent and debt — that pair reads as "we decided
// twice" and whichever entry a reader finds first wins.
const bothLists = [...baselineNames].filter((n) => intentional.has(n));
ok(bothLists.length === 0, `no name in BOTH lists (found ${bothLists.join(", ")})`);

// 1. Nothing new may become dead.
const added = dead.filter((d) => !baselineNames.has(d.name));
ok(added.length === 0, `no NEW dead exports (found ${added.length})`);
for (const d of added) {
  console.error(`      ${d.name}  —  ${d.file}`);
  console.error(`      nothing in the repo references it. Delete it, or wire it up.`);
  console.error(siblingNote(d.file));
}

// 2. The baseline may not rot: an entry that is no longer dead must be removed
//    from the list, or the list stops describing reality.
const revived = [...baselineNames].filter((n) => !deadNames.has(n));
ok(revived.length === 0, `no stale BASELINE entries (found ${revived.length})`);
for (const n of revived) {
  console.error(`      ${n} is referenced again — delete its line from BASELINE.`);
}

console.log(
  `\ndead exports in ${WATCHED.join(", ")}: ${dead.length} (baseline ${baselineNames.size})`,
);
console.log(`over-exported (used in-file only, value is live): ${overExported.length}`);
if (added.length === 0 && revived.length === 0 && dead.length > 0) {
  console.log("recorded debt, worth working down:");
  for (const d of dead) {
    console.log(`  ${d.name}  ${d.file}`);
    console.log(siblingNote(d.file).replace(/^ {6}/, "    "));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
