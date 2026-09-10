// Verifies site CD planning helpers (src/lib/site-cd.ts) — the product bridge
// from kickoff provision to scripts/hetzner/register-site.sh.
//
// Run: npx tsx scripts/test/site-cd.ts
import assert from "node:assert/strict";
import {
  currentSiteDeployment,
  describeSiteDeployment,
  siteDeploymentIsLive,
} from "@/lib/site-cd-deployment";
import {
  DEPLOY_WORKFLOW_PATH,
  RESERVED_SITE_SLUGS,
  deployWorkflowYaml,
  isValidSiteSlug,
  planSiteCd,
  registerSiteCommand,
  siteCdLiveUrl,
  siteCdSlug,
  templateSupportsSiteCd,
} from "@/lib/site-cd";
import {
  canRunRegisterSiteLocally,
  probeRegisterSiteLocally,
  studioDevRoot,
  studioRepoRoot,
} from "@/lib/site-cd-local";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  try {
    assert.deepEqual(actual, expected);
    pass++;
  } catch (e) {
    fail++;
    console.error(`✗ ${msg}`, e);
  }
}
function ok(cond: unknown, msg: string) {
  try {
    assert.ok(cond);
    pass++;
  } catch (e) {
    fail++;
    console.error(`✗ ${msg}`, e);
  }
}

eq(siteCdSlug("Hamster Cheek"), "hamster-cheek", "slug from display name");
eq(siteCdLiveUrl("hamster-cheek"), "https://hamster-cheek.orangecat.ch", "predicted live URL");
ok(isValidSiteSlug("hamster-cheek"), "valid slug");
ok(!isValidSiteSlug("fleetcrown"), "fleetcrown reserved");
ok(RESERVED_SITE_SLUGS.has("fleetcrown"), "reserved set includes control plane");
ok(templateSupportsSiteCd("nextjs-tailwind"), "nextjs supports CD");
ok(templateSupportsSiteCd("bare"), "bare can register CD");
ok(!templateSupportsSiteCd("hono-cloudflare"), "workers starter is not selfhost-deploy");

const yml = deployWorkflowYaml("hamster-cheek");
ok(yml.includes("app: hamster-cheek"), "deploy shim carries apps.conf key");
ok(yml.includes("selfhost-deploy.yml@main"), "deploy shim calls fleetcrown reusable workflow");
ok(
  yml.includes("HETZNER_SSH_PRIVATE_KEY: ${{ secrets.HETZNER_SSH_PRIVATE_KEY }}"),
  "deploy shim passes deploy key explicitly (cross-owner safe)",
);
ok(!yml.includes("secrets: inherit"), "deploy shim does not rely on secrets: inherit");
eq(DEPLOY_WORKFLOW_PATH, ".github/workflows/deploy.yml", "workflow path SSOT");

const cmd = registerSiteCommand({
  slug: "hamster-cheek",
  repo: "bitbaum/hamster-cheek",
  title: "Hamster Cheek",
});
ok(cmd.includes("register-site.sh hamster-cheek"), "command names register-site.sh");
ok(cmd.includes("--repo bitbaum/hamster-cheek"), "command passes repo");

const good = planSiteCd({
  projectName: "Hamster Cheek",
  repoFullName: "catomean/hamster-cheek",
  template: "nextjs-tailwind",
});
ok(good.ok === true, "plan succeeds for nextjs");
if (good.ok) {
  eq(good.slug, "hamster-cheek", "plan slug");
  eq(good.liveUrl, "https://hamster-cheek.orangecat.ch", "plan live URL");
  ok(good.command.includes("register-site.sh"), "plan includes box command");
}

const reserved = planSiteCd({
  projectName: "fleetcrown",
  repoFullName: "bitbaum/fleetcrown",
  template: "nextjs-tailwind",
});
ok(reserved.ok === false && reserved.code === "reserved-slug", "refuses fleetcrown slug");

const workers = planSiteCd({
  projectName: "edge-thing",
  repoFullName: "catomean/edge-thing",
  template: "hono-cloudflare",
});
ok(workers.ok === false && workers.code === "unsupported-template", "refuses workers template");

ok(
  typeof studioDevRoot() === "string" && studioDevRoot().length > 0,
  "studioDevRoot returns a path",
);
ok(
  studioRepoRoot().endsWith("fleetcrown") || studioRepoRoot().includes("fleetcrown"),
  "studioRepoRoot names fleetcrown",
);
const probe = probeRegisterSiteLocally();
ok(typeof probe.ok === "boolean", "probe returns ok");
ok(
  Array.isArray(probe.scriptCandidates) && probe.scriptCandidates.length > 0,
  "probe lists script candidates",
);
ok(
  Array.isArray(probe.keyCandidates) && probe.keyCandidates.length > 0,
  "probe lists key candidates",
);
eq(canRunRegisterSiteLocally(), probe.ok, "canRunRegisterSiteLocally matches probe.ok");
if (!probe.ok) {
  ok(
    typeof probe.reason === "string" && probe.reason.length > 0,
    "failed probe has a reason string",
  );
  ok(probe.gate !== null, "failed probe names a gate");
}

const deployed = {
  status: "completed",
  conclusion: "success",
  head_sha: "current",
  html_url: "https://github.com/run/1",
};
eq(
  currentSiteDeployment([deployed], "newer"),
  undefined,
  "old deployment cannot prove current main is live",
);
ok(
  siteDeploymentIsLive(currentSiteDeployment([deployed], "current"), 200),
  "current successful deployment plus public 200 proves live",
);
ok(
  !siteDeploymentIsLive({ ...deployed, conclusion: "failure" }, 200),
  "an old serving website cannot hide a failed deployment",
);
ok(
  !siteDeploymentIsLive({ ...deployed, status: "in_progress" }, 200),
  "a running workflow cannot claim live",
);
ok(!siteDeploymentIsLive(deployed, 502), "successful workflow cannot hide a broken public site");
ok(!siteDeploymentIsLive(deployed, 302), "a redirect is not proof of a serving site");
ok(
  !siteDeploymentIsLive(undefined, 200),
  "registration plus a public response is not deployment evidence",
);

// The first poll after a dispatch can run before GitHub has created the run.
const queuedOlder = { ...deployed, status: "queued", conclusion: null, head_sha: "older" };
const noDispatch = { dispatch: false, workflowMissing: false };
eq(
  describeSiteDeployment([], "sha", noDispatch).status,
  "failed",
  "no run, no dispatch: nothing is deploying",
);
eq(
  describeSiteDeployment([], "sha", { ...noDispatch, dispatch: true }).status,
  "pending",
  "a dispatch with no run yet is starting, not failed",
);
eq(
  describeSiteDeployment([queuedOlder], "sha", noDispatch).status,
  "pending",
  "a queued run for any commit means a deployment is in flight",
);
ok(
  describeSiteDeployment([queuedOlder], "sha", noDispatch).inFlight,
  "in-flight run is reported so registration does not re-dispatch",
);
eq(
  describeSiteDeployment(
    [{ ...deployed, head_sha: "sha", conclusion: "failure" }],
    "sha",
    noDispatch,
  ).status,
  "failed",
  "a failed run on the current commit is a failure even with older runs",
);
eq(
  describeSiteDeployment([{ ...deployed, head_sha: "sha" }], "sha", noDispatch).status,
  "pending",
  "a successful run still needs the public probe before it is live",
);
ok(
  /deploy workflow is missing/.test(
    describeSiteDeployment([], "sha", { dispatch: false, workflowMissing: true }).reason,
  ),
  "a missing workflow names its own fix",
);

console.log(`${fail === 0 ? "✓" : "✗"} site-cd: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
