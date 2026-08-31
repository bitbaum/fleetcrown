/**
 * A failed deploy must say WHERE it failed.
 *
 * deploy-hetzner.sh runs under `set -euo pipefail`, so any command that exits
 * non-zero kills it on the spot — and several of its commands redirect both
 * streams to /dev/null, because they are questions about the box rather than
 * steps of the deploy. When one of those dies, the operator's entire trace is
 * the EXIT trap's line plus a path to a log file that, in CI, lives on a runner
 * that no longer exists.
 *
 * That happened on 2026-08-15: reading the box's build-ref marker exited 1 on a
 * box that had no marker, and three consecutive deploys failed with nothing
 * between "✓ table ownership reconciled" and "deploy FAILED (exit 1)". #289
 * fixed that one command. This suite guards the general property instead — the
 * next silent death should be a five-second read, not a fresh investigation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const deploy = readFileSync(join(root, "scripts/deploy-hetzner.sh"), "utf8");
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

check("the deploy reports its outcome on every exit path", () => {
  assert(
    /trap report_deploy_status EXIT/.test(deploy),
    "deploy must report its outcome via an EXIT trap",
  );
});

check("a failure names the step it died on", () => {
  // The variable alone is not the property — the failure MESSAGE has to carry
  // it, or the step is tracked and then thrown away.
  assert(
    /DEPLOY_STEP="starting"/.test(deploy),
    "DEPLOY_STEP must have a defined value before the first step",
  );
  // Skip comments: the rationale above this code quotes the old message
  // verbatim, and matching prose instead of the assignment would let the real
  // line drift while the test stayed green.
  const failLine = deploy
    .split("\n")
    .find((l) => l.includes("deploy FAILED") && !l.trim().startsWith("#"));
  assert(Boolean(failLine), "expected a 'deploy FAILED' message assignment in the exit trap");
  assert(
    /\$\{DEPLOY_STEP\}/.test(failLine!),
    "the failure message must include ${DEPLOY_STEP} — otherwise a silent abort still says nothing about where",
  );
});

check("every phase that can die silently sets a step first", () => {
  // Each anchor is a command that can abort the deploy: the gates, the marker
  // read (which did), and the rsync. A phase added later without a step() call
  // reports whatever the PREVIOUS phase set — a wrong answer is worse than a
  // vague one, so these are pinned by position.
  const phases: Array<[string, string]> = [
    ["off-main gate", 'bash "$SCRIPT_DIR/ci/check-deploy-ref.sh"'],
    ["schema migration", 'bash "$SCRIPT_DIR/hetzner/apply-schema.sh"'],
    ["reading the live build marker", "LIVE_REF_NOW="],
    ["rsync to box", "rsync standalone"],
  ];
  for (const [label, anchor] of phases) {
    const stepAt = deploy.indexOf(`step "${label}"`);
    assert(stepAt !== -1, `missing step marker for the ${label} phase`);
    const anchorAt = deploy.indexOf(anchor);
    assert(anchorAt !== -1, `anchor for the ${label} phase is gone: ${anchor}`);
    assert(stepAt < anchorAt, `step "${label}" must be set BEFORE the command it describes`);
  }
});

check("step tracking cannot itself break the deploy", () => {
  // A diagnostic that can fail the thing it diagnoses is a liability. `step` is
  // a plain assignment to a local variable: no subshell, no pipeline, no
  // command substitution, nothing that `set -e` can trip over.
  const fn = deploy.split("\n").find((l) => l.startsWith("step() {"));
  assert(Boolean(fn), "expected a step() helper");
  assert(
    /^step\(\) \{ DEPLOY_STEP="\$1"; \}$/.test(fn!.trim()),
    `step() must be a bare assignment — got: ${fn}`,
  );
});

console.log(`\n${passed}/${passed} passed`);
