// The register has one way to lie: dropping a project because two systems call
// it by different names. Every alias that has actually bitten (aoz, datacat,
// sink, sbb, annushka) is pinned here, and the join is exercised on a fixture
// that contains all four surfaces at once.
// Run: npx tsx scripts/test/fleet-register.ts
import { parseAppsConf } from "@/lib/register/apps-conf";
import { buildFleetRegister, canonicalSlug, repoFromGitUrl, summarize } from "@/lib/register/build";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

// ------------------------------------------------------------- apps.conf
const CONF = `
# name|port|domains|repo_path|app_dir|db|owner|kind|status|plan|price|since
kivvi|4005|kivvi.orangecat.ch|/home/g/dev/kivvi|.|kivvi|RevampIT|client-app|live|retainer|900|2026-03-01
aoz-wohnen|4008|aoz.orangecat.ch|/home/g/dev/aoz-housing|.|-|AOZ|client-app|live|-|-|-
sink|4019|sinktattoo.com,www.sinktattoo.com|/home/g/dev/s-ink|.|-|S-Ink|client-site|live|-|-|-
factory-sep11-0110|4031|factory-sep11-0110.orangecat.ch|/home/ubuntu/dev/factory-sep11-0110|.|-|bitbaum|demo|demo|-|-|2026-09-11
short|4099|short.orangecat.ch
`;
const apps = parseAppsConf(CONF);
ok(apps.length === 5, "parses every non-comment row");
ok(apps[2].domains.length === 2 && apps[2].domains[0] === "sinktattoo.com", "splits domains");
ok(apps[0].port === 4005 && apps[0].plan === "retainer", "keeps port and terms");
ok(apps[4].kind === "-" && apps[4].appDir === ".", "short rows get '-' defaults");

// --------------------------------------------------------------- aliases
ok(canonicalSlug("aoz-wohnen") === "aoz-housing", "aoz-wohnen → aoz-housing");
ok(canonicalSlug("datacat-web") === "datacat", "datacat-web → datacat");
ok(canonicalSlug("sink") === "s-ink", "sink → s-ink");
ok(canonicalSlug("sbb-lost-found") === "sbb-fundbuero", "sbb-lost-found → sbb-fundbuero");
ok(canonicalSlug("Annushka Wild Spirit Art") === "wild-spirit", "display name → wild-spirit");
ok(canonicalSlug("Prime tower") === "prime-tower", "spaces → hyphens");
ok(repoFromGitUrl("https://github.com/bitbaum/datacat.git") === "datacat", "repo from git url");
ok(repoFromGitUrl("git@github.com:bitbaum/s-ink") === "s-ink", "repo from ssh url");
ok(repoFromGitUrl(null) === null, "no url → null");

// ------------------------------------------------------------------ join
const rows = buildFleetRegister(
  [
    {
      id: "1",
      name: "kivvi",
      gitUrl: "https://github.com/bitbaum/kivvi.git",
      orangecatProjectId: null,
    },
    { id: "2", name: "aoz-housing", gitUrl: "https://github.com/bitbaum/aoz-housing.git" },
    { id: "3", name: "Annushka Wild Spirit Art", gitUrl: null },
    {
      id: "4",
      name: "orangecat",
      gitUrl: "https://github.com/bitbaum/orangecat.git",
      orangecatProjectId: "cb09",
    },
    { id: "5", name: "retired", gitUrl: null, isActive: false },
    { id: "6", name: "Sink client", slug: "s-ink", gitUrl: null },
  ],
  apps,
  new Set(["orangecat"]),
);
const by = Object.fromEntries(rows.map((r) => [r.slug, r]));

ok(!("retired" in by), "inactive projects are excluded");
ok(
  by["aoz-housing"]?.site?.host === "aoz.orangecat.ch",
  "aoz-wohnen row attaches to aoz-housing via alias",
);
ok(by["aoz-housing"]?.fleetcrown?.id === "2", "…and keeps its FleetCrown profile");
ok(by["s-ink"]?.site?.host === "sinktattoo.com", "sink row attaches to the stored slug s-ink");
ok(by["s-ink"]?.fleetcrown?.id === "6", "stored slug wins over the display name");
ok(by["orangecat"]?.orangecat?.projectId === "cb09", "OrangeCat link carried");
ok(by["orangecat"]?.solon?.slug === "orangecat", "Solon membership from the org set");
ok(by["kivvi"]?.solon === null && by["kivvi"]?.orangecat === null, "no link → null, not false");
ok(
  by["factory-sep11-0110"]?.fleetcrown === null && by["factory-sep11-0110"]?.site !== null,
  "hosted-only project appears with site and no profile",
);
ok(by["wild-spirit"]?.fleetcrown?.id === "3", "display-name-only project folds to wild-spirit");

const s = summarize(rows);
// 7 projects: five profiles (one inactive, excluded) + two hosted-only rows
// (factory-sep11-0110 and `short`); 5 sites: kivvi, aoz, sink, factory, short.
ok(
  s.projects === 7 && s.sites === 5 && s.fleetcrown === 5 && s.orangecat === 1 && s.solon === 1,
  `summary counts (${JSON.stringify(s)})`,
);

console.log(`fleet-register: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
