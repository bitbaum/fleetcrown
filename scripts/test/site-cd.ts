// Verifies site CD planning helpers (src/lib/site-cd.ts) — the product bridge
// from kickoff provision to scripts/hetzner/register-site.sh.
//
// Run: npx tsx scripts/test/site-cd.ts
import assert from "node:assert/strict";
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

console.log(`${fail === 0 ? "✓" : "✗"} site-cd: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
