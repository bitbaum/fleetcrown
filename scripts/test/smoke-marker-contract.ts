/**
 * The smoke-probe marker is a CONTRACT between two files that must agree:
 * scripts/test/authenticated-smoke.ts writes `[smoke-<ts>] …` dispatches
 * against a real project, and src/db/queries/smoke-filter.ts keeps them out
 * of every surface that presents dispatches as user activity.
 *
 * Before the filter existed, the probe rendered as real fleet work
 * ("bitbaum · [smoke-1786649849209] probe — ignore", 2026-08-13). If either
 * side's marker drifts, the filter silently stops matching and the pollution
 * comes back invisibly — so this test fails the moment they disagree.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SMOKE_MARKER_PREFIX, excludeSmokeDispatchesSql } from "../../src/db/queries/smoke-filter";

const root = join(__dirname, "..", "..");
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const smokeSrc = readFileSync(join(root, "scripts/test/authenticated-smoke.ts"), "utf8");

check("every smoke probe prompt starts with the filtered marker", () => {
  // Template literals of the form `[${tag}] …` / `[${smokeTag}] …` where the
  // tag itself is built as `smoke-${Date.now()}`.
  const tagVars = [...smokeSrc.matchAll(/const (\w+) = `smoke-\$\{Date\.now\(\)\}`/g)].map((m) => m[1]);
  assert(tagVars.length > 0, "authenticated-smoke must build its probe tags as `smoke-<ts>`");
  const markers = [...smokeSrc.matchAll(/`\[\$\{(\w+)\}\][^`]*`/g)].map((m) => m[1]);
  assert(markers.length > 0, "authenticated-smoke must prefix probe prompts with [<tag>]");
  for (const v of markers) {
    assert(
      tagVars.includes(v),
      `probe prompt uses [\${${v}}] but ${v} is not a smoke-<ts> tag — the activity filter would not match it`,
    );
  }
});

check("the filter matches the marker ANYWHERE in the prompt", () => {
  // The same probe reaches prompt_history in two shapes: the bare task line,
  // and the assembled operator envelope with the marker buried under
  // "## Your task". A starts-with LIKE only caught the first — it shipped that
  // way and the envelope form still served from /api/control in prod.
  const frag = excludeSmokeDispatchesSql() as unknown as { queryChunks: unknown[] };
  const literals = frag.queryChunks
    .map((c) => (c && typeof c === "object" && "value" in c ? (c as { value: unknown }).value : c))
    .filter((v): v is string => typeof v === "string");
  assert(
    literals.some((v) => v.includes(`%${SMOKE_MARKER_PREFIX}%`)),
    "excludeSmokeDispatchesSql must LIKE-match '%[smoke-%' (contains), not '[smoke-%' (starts-with) — " +
      "the assembled dispatch envelope carries the marker mid-string",
  );
});

check("the filter prefix matches what the smoke script writes", () => {
  assert(
    SMOKE_MARKER_PREFIX === "[smoke-",
    `filter prefix '${SMOKE_MARKER_PREFIX}' no longer matches the '[smoke-<ts>]' markers the probe writes`,
  );
});

check("user-facing dispatch reads apply the filter", () => {
  // Dedupe/echo lookups are deliberately EXEMPT (the smoke echo test needs to
  // find its own row) — only surfaces that present dispatches as activity.
  const filtered: Array<[string, string[]]> = [
    ["src/db/queries/prompt-history.ts", [
      "getRecentCustomPromptsByProjectKey",
      "getRecentCustomPromptsByProjectKeys",
      "getPromptHistory",
      "getRecentActivity",
      "getLastPromptByProjectKey",
      "getProjectPromptActivity",
    ]],
    ["src/db/queries/activity.ts", ["getProjectActivity", "getProjectActivityBatch"]],
  ];
  for (const [file, fns] of filtered) {
    const src = readFileSync(join(root, file), "utf8");
    for (const fn of fns) {
      const start = src.indexOf(`function ${fn}(`);
      assert(start !== -1, `${fn} not found in ${file}`);
      // Scan to the next top-level export so we only read this function's body.
      const nextExport = src.indexOf("\nexport ", start + 1);
      const body = src.slice(start, nextExport === -1 ? undefined : nextExport);
      assert(
        body.includes("excludeSmokeDispatchesSql()"),
        `${fn} presents dispatches as activity but does not filter smoke probes`,
      );
    }
  }
});

console.log(`\n${passed}/${passed} passed`);
