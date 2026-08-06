// The FleetCrown → OrangeCat public projection. Pins the mapping that used to
// hardcode FleetCrown's own dashboard as every published project's website.
// Run: npx tsx scripts/test/orangecat-publish-payload.ts
import { buildOrangeCatProjectPayload } from "@/lib/integrations/orangecat-project-payload";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${b}, got ${a}`); }
}

const withSite = buildOrangeCatProjectPayload({
  name: "kivvi",
  description: "Circular tech",
  liveUrl: "https://kivvi.orangecat.ch",
});
eq(withSite.website_url, "https://kivvi.orangecat.ch", "publishes the project's OWN site");
eq(withSite.title, "kivvi", "title is the project name");

// The regression that mattered: no live URL must mean NO website_url, never a
// substituted FleetCrown link. A visitor clicking through must not land on a
// private dashboard belonging to a different product.
const noSite = buildOrangeCatProjectPayload({
  name: "Bitbaum",
  description: null,
  liveUrl: null,
});
eq("website_url" in noSite, false, "no live URL → field omitted entirely");
eq(noSite.description, "Built in public with FleetCrown.", "description falls back, not to a URL");

// Never emit an empty string: OrangeCat renders website_url as a link, so ""
// produces a visible link to nowhere (there is one in prod today).
eq(
  "website_url" in buildOrangeCatProjectPayload({ name: "x", description: null, liveUrl: "" }),
  false,
  "empty-string live URL is treated as absent, not published as a blank link",
);

console.log(`${pass}/${pass + fail} orangecat-publish-payload cases passed`);
if (fail > 0) process.exit(1);
