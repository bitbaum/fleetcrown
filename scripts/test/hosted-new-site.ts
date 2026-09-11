// The site-factory command has one job and one hazard.
//
// The job: turn a dispatched payload into a new site. The hazard is the whole
// reason this exists as a TYPED command rather than a prompt — the older
// control path injects free text into a live terminal, and anything that
// reaches that queue becomes instructions on a real box. This path must never
// acquire that property.
//
// So these tests hold two lines:
//   1. Nothing a caller writes may become shell syntax or an instruction. The
//      argument vector is the proof: fields stay whole, separate arguments, no
//      matter what is in them.
//   2. A payload that is wrong is REFUSED, not sanitised into something that
//      runs. Reserved labels, bad slugs, unknown kinds, and priced client work
//      all die before a process starts.
//
// Run: npx tsx scripts/test/hosted-new-site.ts
import {
  validateNewSiteRequest,
  newSiteArgv,
  siteFactoryEnabled,
  SITE_KINDS,
  SITE_STATUSES,
  type NewSiteRequest,
} from "@/lib/hosted-runner/new-site";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

const good = { slug: "causius", title: "Causius", kind: "product", status: "validating" };

// ---------------------------------------------------------------- happy path
{
  const r = validateNewSiteRequest(good);
  ok(r.ok, "a well-formed request validates");
  if (r.ok) {
    ok(r.value.slug === "causius", "slug survives");
    ok(r.value.title === "Causius", "title survives");
  }
}

// An untitled site is named after its slug, exactly as new-site.sh does — two
// paths that disagree about the default name would produce two different sites
// from the same request.
{
  const r = validateNewSiteRequest({ ...good, title: "   " });
  ok(r.ok && r.value.title === "causius", "blank title defaults to the slug");
}

// ------------------------------------------------------- refusals, not fixes
{
  const bad = [
    ["", "empty slug"],
    ["-lead", "leading hyphen"],
    ["trail-", "trailing hyphen"],
    ["Causius", "uppercase"],
    ["cau sius", "space"],
    ["cau;rm -rf /", "shell metacharacters"],
    ["../etc/passwd", "path traversal"],
    ["a".repeat(64), "over the DNS label limit"],
  ];
  for (const [slug, label] of bad) {
    ok(!validateNewSiteRequest({ ...good, slug }).ok, `refuses slug: ${label}`);
  }
}

{
  for (const slug of ["www", "api", "admin", "orangecat", "fleetcrown"]) {
    const r = validateNewSiteRequest({ ...good, slug });
    ok(!r.ok, `refuses reserved slug: ${slug}`);
  }
}

{
  ok(!validateNewSiteRequest({ ...good, kind: "website" }).ok, "refuses an unknown kind");
  ok(!validateNewSiteRequest({ ...good, status: "shipping" }).ok, "refuses an unknown status");
  ok(!validateNewSiteRequest(null).ok, "refuses a null payload");
  ok(!validateNewSiteRequest("causius").ok, "refuses a string payload");
}

// Money terms are not accepted over a queue. The register's plan/price columns
// are answerable at dispatch time and never again, so a live client engagement
// has to be flipped by a human who knows the terms.
{
  const r = validateNewSiteRequest({ ...good, kind: "client-site", status: "live" });
  ok(!r.ok, "refuses a live client engagement (needs plan and price)");
  const stillFine = validateNewSiteRequest({ ...good, kind: "client-site", status: "prospect" });
  ok(stillFine.ok, "the same client work is fine as a prospect");
  const oursCanBeLive = validateNewSiteRequest({ ...good, kind: "product", status: "live" });
  ok(oursCanBeLive.ok, "our own product may be live — no terms are owed to us");
}

// Titles reach a page and a line-oriented env file, never a shell.
{
  ok(!validateNewSiteRequest({ ...good, title: "a\nb" }).ok, "refuses a newline in the title");
  ok(!validateNewSiteRequest({ ...good, title: "a|b" }).ok, "refuses '|' (the register's separator)");
  ok(!validateNewSiteRequest({ ...good, title: "x".repeat(61) }).ok, "refuses an over-long title");
  ok(validateNewSiteRequest({ ...good, title: "Café Ltd." }).ok, "accepts ordinary punctuation");
}

// ------------------------------------------------- arguments, not a command
{
  // The core safety claim. A title full of shell syntax stays ONE argument and
  // is never parsed — this is what makes the path structurally different from
  // injecting text into a terminal.
  const hostile: NewSiteRequest = {
    slug: "safe",
    title: '"; rm -rf / #',
    kind: "product",
    status: "validating",
  };
  const argv = newSiteArgv("/opt/x/new-site.sh", hostile);
  ok(argv[0] === "/opt/x/new-site.sh", "script path leads the vector");
  ok(argv[1] === "safe", "slug is its own argument");
  ok(argv.includes('"; rm -rf / #'), "hostile title survives intact as ONE argument");
  ok(
    argv.filter((a) => a === '"; rm -rf / #').length === 1,
    "hostile title is not split across arguments",
  );
  ok(!argv.some((a) => a.includes("&&") || a.includes(";rm")), "no argument was concatenated");
  ok(argv.length === 8, "vector is exactly script + slug + three flag pairs");
}

// --------------------------------------------------------------- the switch
{
  ok(siteFactoryEnabled({ FLEETCROWN_SITE_FACTORY: "1" } as NodeJS.ProcessEnv), "enabled when set to 1");
  ok(!siteFactoryEnabled({} as NodeJS.ProcessEnv), "OFF by default — merging must not arm it");
  ok(
    !siteFactoryEnabled({ FLEETCROWN_SITE_FACTORY: "true" } as NodeJS.ProcessEnv),
    "only '1' arms it — no accidental truthiness",
  );
}

// The vocabularies are the register's, and drifting from apps.conf silently
// produces rows the ledger checks cannot read.
{
  ok(SITE_KINDS.includes("client-site"), "kinds cover client work");
  ok(SITE_STATUSES.includes("prospect"), "statuses cover prospect");
}

console.log(`hosted-new-site: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
