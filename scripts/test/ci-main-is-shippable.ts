/**
 * A commit on main must keep a path to the box.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-09-11 four merges reached main and never left the repository. Every
 * check was green, no job was red, nothing anywhere was marked failed — the
 * commits simply sat there while the box served the previous build. Each needed
 * a Deploy dispatched by hand.
 *
 * Two paths ship a commit, and exactly one of them fires per commit by design:
 *
 *   push to main     → CI finishes → Deploy chains off `workflow_run`
 *   dispatch on main → CI finishes → the `ship` job dispatches Deploy
 *
 * Under a concurrency group keyed only by branch, auto-merge's re-armed dispatch
 * cancels the push run for the same commit. That is FINE and intended: `ship`
 * then becomes the single path, and the comment in ci.yml says so.
 *
 * What is not fine is the next merge cancelling the surviving run of the
 * previous one. That kills both paths at once. `gh run list` for the stranded
 * commit showed a cancelled push run AND a cancelled dispatch run, with a clean
 * success five minutes later belonging to a different commit.
 *
 * So the property is narrow and worth stating exactly: **on main, one commit's
 * CI must never cancel another commit's.** Same-commit cancellation stays.
 *
 * There is no red to notice when this breaks. The symptom is silence, and
 * silence is also what a healthy pipeline looks like — which is why this is a
 * gate rather than a comment.
 *
 * Run: npx tsx scripts/test/ci-main-is-shippable.ts
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const wf = (name: string) => readFileSync(join(REPO, ".github", "workflows", name), "utf8");
const CI = wf("ci.yml");
const DEPLOY = wf("deploy.yml");
const AUTOMERGE = wf("auto-merge.yml");

/** Lines with the comment stripped, so a check can never be satisfied by prose. */
function code(src: string): string[] {
  return src
    .split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .filter((l) => l.trim().length > 0);
}

/**
 * The keys of a top-level block, by indentation. Used for `on:` so that the
 * word "workflow_dispatch" appearing in a comment or an `if:` cannot stand in
 * for the trigger actually being declared — the first draft of this gate made
 * exactly that mistake and passed a mutation that removed the trigger.
 */
function blockKeys(src: string, block: string): string[] {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^${block}:`).test(l));
  if (start < 0) return [];
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim()) break; // next top-level key
    const m = /^\s{2}([A-Za-z_][\w-]*):/.exec(line.replace(/#.*$/, ""));
    if (m) keys.push(m[1]);
  }
  return keys;
}

const problems: string[] = [];
let passed = 0;

function check(label: string, condition: boolean, why: string) {
  if (condition) passed++;
  else problems.push(`${label}\n      ${why}`);
}

// ── the property itself ─────────────────────────────────────────────────────
const group =
  code(CI)
    .find((l) => /^\s*group:/.test(l))
    ?.trim() ?? "";

check(
  "on main, one commit's CI cannot cancel another commit's",
  group.includes("github.sha"),
  "The concurrency group does not vary by `github.sha`, so a newer merge cancels\n" +
    "      an older commit's still-running CI — killing both its ship paths at once.\n" +
    "      Group was: " +
    (group || "(none found)"),
);

check(
  "branches still cancel superseded runs",
  /cancel-in-progress:\s*true/.test(code(CI).join("\n")),
  "`cancel-in-progress` is no longer true. On a PR branch the newest push is the\n" +
    "      only one that matters; without this every superseded push burns a full run.",
);

// ── the premises. If one moves, this gate is guarding a ghost. ──────────────
check(
  "CI is dispatchable, so auto-merge can re-arm it",
  blockKeys(CI, "on").includes("workflow_dispatch"),
  "ci.yml's `on:` block no longer declares `workflow_dispatch`. A merge made with\n" +
    "      GITHUB_TOKEN triggers no workflows at all, so the re-arm is the only thing\n" +
    "      that starts CI for it — and the `ship` job below only runs on a dispatch.",
);

check(
  "the dispatch path still ships",
  /ship:/.test(CI) && /gh workflow run deploy\.yml/.test(CI),
  "ci.yml lost the `ship` job that dispatches Deploy when main is green. That is\n" +
    "      the path a re-armed dispatch uses; without it, a dispatch-only commit has\n" +
    "      no route to the box but the sweep's poll.",
);

check(
  "the push path still ships",
  /workflow_run:/.test(DEPLOY) && /workflows:\s*\[?["']CI["']/.test(DEPLOY),
  "deploy.yml no longer chains off CI's `workflow_run`. If the chain changed,\n" +
    "      re-derive what starves it and rewrite this gate — do not delete it.",
);

check(
  "Deploy still refuses a run that did not pass",
  /workflow_run\.conclusion\s*==\s*'success'/.test(DEPLOY),
  "deploy.yml no longer gates on `conclusion == 'success'`. That gate is why a\n" +
    "      cancelled run stops a deploy — the whole reason cross-commit cancellation\n" +
    "      on main is fatal.",
);

check(
  "auto-merge still reconciles deployment",
  /deploy_workflow:\s*deploy\.yml/.test(AUTOMERGE),
  "auto-merge.yml lost `deploy_workflow: deploy.yml` — the backstop that ships a\n" +
    "      commit whose trigger went missing anyway.",
);

if (problems.length > 0) {
  console.error("✗ ci-main-is-shippable:");
  for (const p of problems) console.error(`    ${p}`);
  console.error(
    "\n    The failure this protects against is SILENT: main green, nothing red,\n" +
      "    and the commit never reaching the box.",
  );
  process.exit(1);
}

console.log(
  `✓ ci-main-is-shippable: ${passed} properties hold — a merge on main keeps a path to the box`,
);
