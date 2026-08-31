/**
 * Inline self-test: publishing a release is not a machine installing it.
 *
 * WHY
 * ---
 * FleetCrown published Fleet Runner releases and had no way to know whether
 * any machine ever ran one. On 2026-08-26 the laptop was on **0.8.12** while
 * the box ran **box-0.8.13**, and nothing anywhere compared either number to
 * what had been published.
 *
 * That was not cosmetic. 0.8.12 predates the inject-hardening that landed
 * 2026-08-23 (`c350623c`) — the change that retries a stuck paste and then
 * HARD-FAILS instead of acking `ok: true`. So that runner kept accepting
 * unverified injects and leaving the runs to be reaped an hour later; 29 runs
 * died that way and were billed to the projects whose prompts went unanswered.
 * A machine silently running old code degraded the fleet for twelve days.
 *
 * The comparison needs nothing new: FLEET_RUNNER_RELEASES is already the SSOT
 * for what shipped, and every runner reports its version on every heartbeat.
 * The only thing missing was the subtraction.
 *
 * Run: npx tsx scripts/test/runner-version-drift.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { runnerVersionStatus, normalizeRunnerVersion } from "@/lib/runner-version";
import { FLEET_RUNNER_RELEASES } from "@/config/changelog";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "../..");

const RELEASES = [{ version: "0.8.13" }, { version: "0.8.12" }, { version: "0.8.11" }];

// ── The case that actually happened ────────────────────────────────────────

{
  const r = runnerVersionStatus("0.8.12", RELEASES);
  assert(r.state === "behind", "0.8.12 against a published 0.8.13 must read as BEHIND");
  assert(r.behindBy === 1, `expected behindBy 1, got ${r.behindBy}`);
  assert(
    /dormant/i.test(r.detail),
    "the detail must say what being behind COSTS — a version number alone does " +
      "not tell an operator that merged features are inert on that machine",
  );
}

// ── Absence is not health ──────────────────────────────────────────────────
//
// The failure this whole class keeps producing: something unmeasured reported
// as fine. A runner that has never said which version it runs is UNKNOWN.

for (const missing of [null, undefined, "", "dev", "unknown", "box-"]) {
  const r = runnerVersionStatus(missing as string | null, RELEASES);
  assert(
    r.state === "unknown",
    `a runner reporting ${JSON.stringify(missing)} must read as UNKNOWN, got "${r.state}"`,
  );
  assert(
    r.state !== "current",
    `a runner reporting ${JSON.stringify(missing)} must never read as CURRENT`,
  );
}

// ── The box prefix must not make the most current runner unreadable ────────

assert(normalizeRunnerVersion("box-0.8.13") === "0.8.13", "box- prefix must be stripped");
assert(normalizeRunnerVersion("0.8.13") === "0.8.13", "a bare version is already normal");
assert(normalizeRunnerVersion("garbage") === null, "an unparsable version is null, not a guess");

{
  const r = runnerVersionStatus("box-0.8.13", RELEASES);
  assert(
    r.state === "current",
    "box-0.8.13 is the newest published release — stripping the channel prefix " +
      "is what stops the fleet's most up-to-date runner from reading as unknown",
  );
}

// ── A deploy-synced runner legitimately runs ahead ─────────────────────────
//
// The box builds from main, so it reaches a version before that version is
// tagged and published. Reporting that as a fault would make the check cry
// wolf on every merge — and a check that cries wolf is one nobody reads.

{
  const r = runnerVersionStatus("box-0.9.0", RELEASES);
  assert(r.state === "ahead", "a deploy-synced runner ahead of the tag is not a fault");
  assert(r.behindBy === 0, "ahead is not behind");
}

{
  const r = runnerVersionStatus("0.8.13", RELEASES);
  assert(r.state === "current" && r.behindBy === 0, "the newest release reads as current");
}

// ── Counting, not just comparing ───────────────────────────────────────────

{
  const r = runnerVersionStatus("0.8.11", RELEASES);
  assert(r.state === "behind", "two releases back is behind");
  assert(r.behindBy === 2, `expected behindBy 2, got ${r.behindBy}`);
}

// ── It must read the real SSOT, not a copy ─────────────────────────────────

{
  const live = runnerVersionStatus("0.0.1");
  assert(
    live.latest === FLEET_RUNNER_RELEASES[0].version,
    "the default release list must be FLEET_RUNNER_RELEASES itself — a second " +
      "hand-maintained list of shipped versions is exactly the drift this " +
      "check exists to detect",
  );
}

// ── Fleet Doctor must actually consult it, and rank it honestly ────────────

const doctor = readFileSync(resolvePath(repoRoot, "src/app/api/system/doctor/route.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

assert(
  /runnerVersionStatus\(/.test(doctor),
  "Fleet Doctor must consult runnerVersionStatus — a helper nothing calls is " +
    "not a check, and this whole class of bug is things that were never looked at",
);
assert(
  /"behind"\s*\?\s*"fail"/.test(doctor),
  "a runner behind the published release must FAIL the doctor, not warn: " +
    "merged desktop work is inert on that machine and that is a defect, not a note",
);
assert(
  /"unknown"\s*\?\s*"warn"/.test(doctor),
  "an unknown runner version must WARN rather than pass — 'we could not tell' " +
    "and 'it is current' are different answers",
);

// ── Doctor alone is NOT a production path ──────────────────────────────────
//
// Found by probing the live authenticated endpoint after deploying the Doctor
// check: /api/system/doctor returned HTTP 200 with exactly ONE check, `runtime`.
// On the hosted box `isRuntimeAvailable()` is false, so the route short-circuits
// with "runs full checks only on the local install" and executes none of its
// checks. A check that lives only in Doctor therefore never runs in production
// — present, plausible, and incapable of firing where it matters.
//
// So the clock is the live path, and these assertions stop it being removed as
// "redundant with Doctor".

const cronRoute = resolvePath(repoRoot, "src/app/api/crons/check-runner-version/route.ts");
// A CALL, not a mention: the first version of this assertion used
// .includes("runnerVersionStatus"), which the surviving `import` line satisfied
// while the call site had been gutted. Comments stripped for the same reason.
const cronCode = readFileSync(cronRoute, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");
assert(
  /runnerVersionStatus\s*\(\s*\w/.test(cronCode),
  "a cron target must run this check on the hosted box — Fleet Doctor does not " +
    "execute its checks there (isRuntimeAvailable() is false), so Doctor alone " +
    "leaves the check inert in the only environment that matters.",
);

const sched = readFileSync(resolvePath(repoRoot, "scripts/install-hetzner-crons.sh"), "utf8");
assert(
  /\[check-runner-version\]="\d\d:\d\d"/.test(sched),
  "check-runner-version must be in the SCHED table of install-hetzner-crons.sh. " +
    "An API route with no timer is a check nothing ever calls — the same " +
    "not-actually-running failure one layer down.",
);

console.log("✓ runner version: a published release is not an installed one");
