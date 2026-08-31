/**
 * Production must be able to say what commit it is running.
 *
 * Before the marker existed, nothing could answer that: /api/health reported
 * `npm_package_version` (null under systemd) and the box kept no deploy record.
 * A hand-run deploy ships whatever branch the worktree is on and rolled prod
 * back three times — 2026-08-14 being the third, WITH the off-main gate in
 * place, because that gate only requires the commit to be *contained in* main
 * and an ancestor passes. Every time, the symptom read as an application bug:
 * a fix demonstrably on main, missing at runtime, with no way to check but
 * ssh-ing in and grepping the compiled bundle.
 *
 * This suite guards the chain end to end — stamp written at build, carried by
 * the artifact, read by health, asserted by the deploy — because every link is
 * deploy-time-only code, the kind that rots unnoticed until the incident.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

check("postbuild stamps the build before anything ships it", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const postbuild: string = pkg.scripts?.postbuild ?? "";
  assert(
    postbuild.includes("record-build-ref.sh"),
    "postbuild must run record-build-ref.sh — a build with no stamp is a build prod cannot identify",
  );
  assert(
    existsSync(join(root, "scripts/record-build-ref.sh")),
    "scripts/record-build-ref.sh is missing",
  );
});

check("the stamp lands inside the artifact both deploy paths ship", () => {
  // deploy-hetzner.sh rsyncs .next/standalone/ → the box app dir, and the
  // GitHub Deploy workflow builds the same way then calls it with --no-build.
  // Writing anywhere else would mean the marker rides one path and not the other.
  const script = readFileSync(join(root, "scripts/record-build-ref.sh"), "utf8");
  assert(
    script.includes(".next/standalone/.build-ref"),
    "the marker must be written into .next/standalone so rsync carries it",
  );
  const deploy = readFileSync(join(root, "scripts/deploy-hetzner.sh"), "utf8");
  assert(
    /STANDALONE=.*\.next\/standalone/.test(deploy),
    "deploy no longer rsyncs .next/standalone — marker path is wrong",
  );
});

check("a build with no resolvable commit does not fail the build", () => {
  // Best-effort by design: an unknown commit degrades to `commit: null`, the
  // exact behaviour before the marker existed. Failing here would mean a
  // diagnostic aid could break shipping.
  const dir = mkdtempSync(join(tmpdir(), "buildref-"));
  try {
    mkdirSync(join(dir, "scripts"), { recursive: true });
    mkdirSync(join(dir, ".next", "standalone"), { recursive: true });
    writeFileSync(
      join(dir, "scripts", "record-build-ref.sh"),
      readFileSync(join(root, "scripts/record-build-ref.sh")),
    );
    // No git repo, no env vars → no SHA is resolvable anywhere.
    const out = execFileSync("bash", [join(dir, "scripts", "record-build-ref.sh")], {
      env: { PATH: process.env.PATH ?? "", HOME: dir },
      encoding: "utf8",
    });
    assert(/not recorded/.test(out), `expected a warning, got: ${out}`);
    assert(
      !existsSync(join(dir, ".next", "standalone", ".build-ref")),
      "no SHA must mean no marker, not an empty one",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function stampIn(env: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "buildref-"));
  try {
    mkdirSync(join(dir, "scripts"), { recursive: true });
    mkdirSync(join(dir, ".next", "standalone"), { recursive: true });
    writeFileSync(
      join(dir, "scripts", "record-build-ref.sh"),
      readFileSync(join(root, "scripts/record-build-ref.sh")),
    );
    execFileSync("bash", [join(dir, "scripts", "record-build-ref.sh")], {
      env: { PATH: process.env.PATH ?? "", HOME: dir, ...env },
      encoding: "utf8",
    });
    return readFileSync(join(dir, ".next", "standalone", ".build-ref"), "utf8").trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

check("the pinned deploy ref wins over everything", () => {
  // deploy-hetzner.sh pins --ref and HEAD can drift mid-build; the stamp must
  // describe what was BUILT, not where the checkout wandered to.
  const written = stampIn({ FLEETCROWN_DEPLOY_REF: "deadbeef", GITHUB_SHA: "cafe1234" });
  assert(written === "deadbeef", `FLEETCROWN_DEPLOY_REF must win, got '${written}'`);
});

check("GITHUB_SHA never overrides the commit that was actually checked out", () => {
  // deploy.yml's workflow_run path checks out `workflow_run.head_sha`, which is
  // not always the run's GITHUB_SHA. Stamping the env value there would record a
  // commit that was never compiled — and since the deploy compares the live
  // marker against the shipped ref, a lying marker manufactures a false alarm.
  const script = readFileSync(join(root, "scripts/record-build-ref.sh"), "utf8");
  const headAt = script.indexOf("rev-parse HEAD");
  const envAt = script.indexOf('SHA="${GITHUB_SHA:-}"');
  assert(headAt !== -1 && envAt !== -1, "expected both git HEAD and GITHUB_SHA fallbacks");
  assert(headAt < envAt, "git HEAD must be consulted BEFORE GITHUB_SHA");
});

check("/api/health reports the commit, and never guesses one", () => {
  const health = readFileSync(join(root, "src/app/api/health/route.ts"), "utf8");
  assert(/commit:\s*BUILD_COMMIT/.test(health), "/api/health must expose the build commit");
  assert(health.includes(".build-ref"), "/api/health must read the build-ref marker");
  assert(
    /return null;/.test(health),
    "an unreadable marker must report null, not a fabricated value",
  );
});

check("the deploy asserts the LIVE box runs the commit it just shipped", () => {
  // Health being 200 proves the box is up, not that it is up on THIS build.
  const deploy = readFileSync(join(root, "scripts/deploy-hetzner.sh"), "utf8");
  assert(deploy.includes("LIVE_SHA"), "deploy must read the live commit back from the box");
  assert(
    /"\$LIVE_SHA" != "\$SHIPPED_SHA"/.test(deploy),
    "deploy must compare the live commit against the shipped one",
  );
  // Reported, NOT rolled back. The realistic cause of a mismatch is a second
  // deploy landing behind this one, and reverting to app.prev would discard the
  // NEWER build — manufacturing the very incident this check exists to catch.
  // What was missing was ever being told; that is what this must guarantee.
  const block = deploy.slice(deploy.indexOf("SHIPPED_SHA="), deploy.indexOf("✓ deployed"));
  assert(/⚠ live build is/.test(block), "a mismatch must be announced");
  assert(
    !/rollback_box/.test(block),
    "a commit mismatch must NOT roll back — it would discard the newer build",
  );
});

console.log(`\n${passed}/${passed} passed`);
