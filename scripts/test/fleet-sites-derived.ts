// src/config/fleet-sites.ts must equal what apps.conf generates. If this fails,
// someone edited the list by hand or changed the register without regenerating:
//   npx tsx scripts/generate-fleet-sites.ts
// Run: npx tsx scripts/test/fleet-sites-derived.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readAppsConf } from "@/lib/register/apps-conf";
import { renderFleetSites, listedSites } from "../generate-fleet-sites";

const root = process.cwd();
const apps = readAppsConf(root);
const expected = renderFleetSites(apps);
const actual = readFileSync(join(root, "src/config/fleet-sites.ts"), "utf8");

let fail = 0;
if (apps.length === 0) {
  console.error("✗ apps.conf not readable from", root);
  fail++;
}
if (actual !== expected) {
  console.error(
    "✗ src/config/fleet-sites.ts drifted from apps.conf — run: npx tsx scripts/generate-fleet-sites.ts",
  );
  fail++;
}
const listed = listedSites(apps);
if (listed.length < 5) {
  console.error(`✗ suspiciously few listed sites (${listed.length}) — filter or register broken?`);
  fail++;
}
console.log(
  `fleet-sites-derived: ${fail === 0 ? "in sync" : "DRIFT"} (${listed.length} listed sites)`,
);
process.exit(fail === 0 ? 0 : 1);
