/**
 * Inline self-test: Fleet Runner code that is merged must be code that can
 * reach a machine.
 *
 * WHY THIS EXISTS
 * ---------------
 * Server code ships itself: merge → CI → Deploy reconciler → the box. Desktop
 * code does not. It ships only when someone mints a `fleet-runner-v*` tag, and
 * the tag is minted only when someone remembers to bump
 * `desktop/package.json`. Nothing ever checked that they did.
 *
 * So it stopped happening, and nothing said so. Measured 2026-08-26: SIX
 * merged commits touching desktop/ sat on main after v0.8.12 — a new
 * power-source router (#319), a usage double-billing fix (#349), capture-hook
 * changes — with the version still reading `0.8.12`, identical to the tag.
 * Every one of them was live on the server and absent from every machine.
 * `git log` looked healthy; the release page looked healthy; the two simply
 * described different code.
 *
 * That is issue #227's failure, and note it is NOT the cause #227 names. The
 * publish-token break it was filed for is fixed — the pipeline is green and
 * v0.8.12 published fine. The chain broke one link further back, at the human
 * step, which is exactly where a break leaves no trace.
 *
 * THE RULE
 * --------
 * If anything that gets built into the runner differs from the last released
 * tag, the version must already be ahead of that tag. Bumping it is the
 * author's statement that this change is meant to reach machines; CI mints the
 * tag from it (see the `release-desktop` job in ci.yml), so the bump is the
 * only human step and forgetting it is now red instead of silent.
 *
 * NO TAGS IS A FAILURE, NOT A PASS
 * --------------------------------
 * This check reads git tags, and `actions/checkout` fetches none by default —
 * so the obvious version of this gate passes vacuously in the one place it
 * most needs to run. A shallow checkout with `fetch-tags` is not enough either
 * — the tagged commit's trees are still missing, so the diff below cannot run.
 * ci.yml's check job therefore uses `fetch-depth: 0`; if that ever regresses,
 * the absence is reported as a failure rather than quietly counted as clean.
 * A gate that cannot go red is decoration.
 *
 * Run: npx tsx scripts/test/desktop-release-drift.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { FLEET_RUNNER_RELEASES } from "@/config/changelog";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const TAG_PREFIX = "fleet-runner-v";

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** "0.8.12" → [0, 8, 12]. Non-numeric segments sort as 0, which is fine: the
 *  only thing compared here is our own two-part release numbering. */
function parseVersion(v: string): number[] {
  return v.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readVersionFrom(json: string): string {
  const parsed = JSON.parse(json) as { version?: string };
  assert(
    typeof parsed.version === "string" && parsed.version.length > 0,
    "desktop/package.json has no version field",
  );
  return parsed.version!;
}

// ── The three states ────────────────────────────────────────────────────────

// 1. Could we look at all? Absence of tags is "unchecked", never "clean".
let tagList = "";
try {
  tagList = git("tag", "--list", `${TAG_PREFIX}*`);
} catch (err) {
  throw new Error(
    `cannot read git tags, so whether desktop code ships is UNKNOWN — ` +
      `refusing to report clean. Underlying error: ${(err as Error).message}`,
  );
}

const tags = tagList.split("\n").map((t) => t.trim()).filter(Boolean);
assert(
  tags.length > 0,
  `no ${TAG_PREFIX}* tags are present, so this check cannot tell whether ` +
    `desktop/ has shipped. In CI this means actions/checkout stopped fetching ` +
    `tags (ci.yml needs 'fetch-tags: true'); locally, fetch them with ` +
    `'git fetch --tags'. Reporting UNCHECKED rather than passing vacuously.`,
);

const latestTag = tags
  .slice()
  .sort((a, b) => compareVersions(a.slice(TAG_PREFIX.length), b.slice(TAG_PREFIX.length)))
  .at(-1)!;
const releasedVersion = latestTag.slice(TAG_PREFIX.length);

// 2. Has anything that gets BUILT into the runner changed since that release?
//    README-only edits do not reach a binary, so they must not demand a
//    version bump — everything else in desktop/ does.
let changed: string[] = [];
try {
  changed = git("diff", "--name-only", latestTag, "HEAD", "--", "desktop")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !f.endsWith(".md"));
} catch (err) {
  throw new Error(
    `cannot diff HEAD against ${latestTag}, so desktop drift is UNKNOWN — ` +
      `refusing to report clean. Underlying error: ${(err as Error).message}`,
  );
}

// 3. If it changed, the version must already be ahead of the released one.
const currentVersion = readVersionFrom(
  readFileSync(resolve(repoRoot, "desktop/package.json"), "utf8"),
);

if (changed.length > 0) {
  const ahead = compareVersions(currentVersion, releasedVersion) > 0;
  assert(
    ahead,
    `desktop/ has ${changed.length} file(s) changed since ${latestTag}, but ` +
      `desktop/package.json still reads ${currentVersion} — the same version ` +
      `that already shipped. Merging this leaves the change on the server and ` +
      `on no machine at all, silently, which is exactly how six commits went ` +
      `missing after v0.8.12.\n` +
      `Fix: bump the version in desktop/package.json (CI mints the tag and ` +
      `publishes the release from it).\n` +
      `Changed: ${changed.slice(0, 12).join(", ")}` +
      (changed.length > 12 ? `, +${changed.length - 12} more` : ""),
  );
}

// ── A bump also has to be publishable ───────────────────────────────────────
//
// scripts/mirror-desktop-release.sh refuses to publish a version with no
// FLEET_RUNNER_RELEASES entry, because /releases and the footer version pill
// would then advertise an older build than operators are running. That refusal
// is correct, but it arrives at the END of the pipeline: v0.8.13 built cleanly
// on all three OS runners and died at the publish step, so the whole release
// was three builds of wasted work and still nothing on any machine.
//
// The check belongs where the bump is made. Same rule as the bump itself — a
// mechanical prerequisite that a person forgets — so it fails in CI on the PR
// rather than twenty minutes into a matrix build.
if (compareVersions(currentVersion, releasedVersion) > 0) {
  const entry = FLEET_RUNNER_RELEASES.find((r) => r.version === currentVersion);
  assert(
    entry !== undefined,
    `desktop/package.json is at ${currentVersion}, but src/config/changelog.ts ` +
      `has no FLEET_RUNNER_RELEASES entry for it. The release would build on ` +
      `all three OS runners and then be REFUSED at the publish step, because ` +
      `/releases would otherwise claim an older version than operators run.\n` +
      `Fix: add the entry (version/tag/date/highlights) next to the bump.`,
  );
  assert(
    entry!.tag === `${TAG_PREFIX}${currentVersion}`,
    `changelog entry for ${currentVersion} carries tag "${entry!.tag}", but the ` +
      `release will be published as "${TAG_PREFIX}${currentVersion}". The ` +
      `/releases page would link a tag that does not exist.`,
  );
}

// A version that has moved BACKWARDS past a release would make the tag job
// mint a tag that already exists, and silently never ship again.
assert(
  compareVersions(currentVersion, releasedVersion) >= 0,
  `desktop/package.json reads ${currentVersion}, which is BEHIND the released ` +
    `${latestTag}. A release can only move forward — nothing would ever ship ` +
    `from this version again.`,
);

// ── The gate must not outlive the machinery it assumes ─────────────────────
//
// Everything above trusts two things about ci.yml: that tags are fetched (or
// this check is blind) and that a bumped version actually becomes a tag (or
// "pending" is a state nothing ever leaves). Delete either and this file keeps
// printing ✓ while desktop stops shipping again — the failure it exists to
// prevent, wearing its own passing output as a disguise.
/**
 * ci.yml with every `#` comment removed.
 *
 * Load-bearing, and learned the hard way twice. The header comment above the
 * `check` job explains itself with the words `fetch-depth: 0` — so an assertion
 * scanning the raw file matched its own rationale and passed while the real
 * setting had been changed to 1. A rule must never be satisfiable by the prose
 * describing it, or the counter-example in the docs becomes the alibi.
 */
const ciWorkflow = readFileSync(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8")
  .split("\n")
  .map((line) => line.replace(/#.*$/, ""))
  .join("\n");

/** The body of one top-level job, so an assertion about `check` cannot be
 *  satisfied by an identical line sitting in a different job. The first draft
 *  of this file scanned the whole workflow and duly passed while the `check`
 *  job was blinded, because `release-desktop` still carried the line it was
 *  looking for. */
function jobBlock(name: string): string {
  const start = ciWorkflow.search(new RegExp(`^ {2}${name}:$`, "m"));
  if (start === -1) return "";
  const rest = ciWorkflow.slice(start + 1);
  const end = rest.search(/^ {2}[a-z][\w-]*:$/m);
  return end === -1 ? rest : rest.slice(0, end);
}

const checkJob = jobBlock("check");
assert(
  checkJob.length > 0,
  "ci.yml has no `check` job — the job that runs verify, and therefore this gate.",
);
assert(
  /fetch-depth:\s*0/.test(checkJob),
  "ci.yml's `check` job no longer checks out with fetch-depth: 0, so CI has no " +
    "release tags and this drift gate cannot see anything. Restore it, or this " +
    "check is blind in the one environment that gates merges.",
);

assert(
  /^\s{2}release-desktop:/m.test(ciWorkflow),
  "ci.yml has no `release-desktop` job, so bumping desktop/package.json would " +
    "never mint a tag and never publish. A bumped-but-untagged version passes " +
    "the drift check forever while shipping nothing — exactly the silent gap " +
    "this gate was written to close.",
);

assert(
  /gh workflow run desktop-release\.yml/.test(ciWorkflow),
  "ci.yml tags a release but no longer DISPATCHES desktop-release.yml. A tag " +
    "pushed with the default GITHUB_TOKEN triggers no workflow, so the tag " +
    "would exist and nothing would ever build it.",
);

const state =
  changed.length === 0
    ? `clean — desktop/ is identical to ${latestTag}`
    : `pending — ${changed.length} file(s) changed, version ${currentVersion} > released ${releasedVersion}`;
console.log(`✓ desktop release drift: ${state}`);
