// Verifies the Atlas pure cores: site metadata parsing (src/lib/atlas/probe.ts)
// and the observed link graph (src/lib/atlas/graph.ts). Both run without a
// network or a DB — the fragile parts are the ones worth pinning.
// Run: npx tsx scripts/test/atlas.ts
import { parseSiteHtml } from "@/lib/atlas/probe";
import { buildAtlasGraph, type AtlasSiteInput } from "@/lib/atlas/graph";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${b}, got ${a}`); }
}

// ── parseSiteHtml ───────────────────────────────────────────────────────────
const BASE = "https://kivvi.orangecat.ch/";

const full = parseSiteHtml(
  `<html><head>
     <title>Fallback Title</title>
     <meta property="og:title" content="Kivvi &mdash; Circular tech">
     <meta property="og:description" content="Repair, reuse &amp; rehome hardware.">
     <meta property="og:image" content="/opengraph-image.png">
   </head><body>
     <a href="https://orangecat.ch/projects/1">Fund us</a>
     <a href="https://www.orangecat.ch/about">About</a>
     <a href="/internal">Internal</a>
     <a href="mailto:hi@kivvi.ch">Mail</a>
   </body></html>`,
  BASE,
);
eq(full.title, "Kivvi &mdash; Circular tech", "og:title wins over <title>");
eq(full.description, "Repair, reuse & rehome hardware.", "entities decoded in description");
eq(full.previewImageUrl, "https://kivvi.orangecat.ch/opengraph-image.png", "relative og:image absolutized");
eq(full.outboundHosts, ["orangecat.ch", "www.orangecat.ch"], "external hosts only, deduped + sorted");

// Attribute order must not matter — plenty of real sites put content first.
const reversed = parseSiteHtml(
  `<head><meta content="Reversed" property="og:title"><title>Ignored</title></head>`,
  BASE,
);
eq(reversed.title, "Reversed", "meta parsed regardless of attribute order");

// No og tags at all → fall back to <title> and name=description.
const bare = parseSiteHtml(
  `<head><title>  Solon\n  Governance </title><meta name="description" content="Vote."></head>`,
  BASE,
);
eq(bare.title, "Solon Governance", "<title> fallback, whitespace collapsed");
eq(bare.description, "Vote.", "name=description fallback");
eq(bare.previewImageUrl, null, "no image → null, not a guess");

// Self-links and relative links are never outbound.
const selfOnly = parseSiteHtml(
  `<body><a href="/a">a</a><a href="https://kivvi.orangecat.ch/b">b</a></body>`,
  BASE,
);
eq(selfOnly.outboundHosts, [], "own host excluded");

// Single-quoted and unquoted attributes still parse.
const quoting = parseSiteHtml(
  `<head><meta property='og:title' content='Single'></head><body><a href=https://solon.orangecat.ch>s</a></body>`,
  BASE,
);
eq(quoting.title, "Single", "single-quoted attribute");
eq(quoting.outboundHosts, ["solon.orangecat.ch"], "unquoted href");

// A malformed og:image must not crash or produce a relative string.
eq(
  parseSiteHtml(`<head><meta property="og:image" content="ht!tp://%%%"></head>`, BASE).previewImageUrl,
  "https://kivvi.orangecat.ch/ht!tp://%%%",
  "unparseable image resolved against base rather than thrown",
);

// ── buildAtlasGraph ─────────────────────────────────────────────────────────
const sites: AtlasSiteInput[] = [
  { projectId: "oc", name: "orangecat", liveUrl: "https://orangecat.ch", outboundHosts: ["fleetcrown.orangecat.ch", "github.com"] },
  { projectId: "fc", name: "fleetcrown", liveUrl: "https://fleetcrown.orangecat.ch", outboundHosts: ["www.orangecat.ch"] },
  { projectId: "so", name: "solon", liveUrl: "https://solon.orangecat.ch", outboundHosts: [] },
  { projectId: "hc", name: "HamsterCheek", liveUrl: null, outboundHosts: [] },
];
const graph = buildAtlasGraph(sites);

eq(graph.edges.length, 2, "two internal edges (github.com is off-fleet)");
eq(
  graph.edges.map((e) => `${e.fromName}->${e.toName}:${e.reciprocal}`),
  ["fleetcrown->orangecat:true", "orangecat->fleetcrown:true"],
  "www.orangecat.ch resolves to orangecat.ch → reciprocal both ways",
);
eq(graph.unlinked.map((s) => s.name), ["solon"], "solon: live but nothing links to it");
eq(graph.deadEnds.map((s) => s.name), ["solon"], "solon: links out to nothing on the fleet");

// A project with no site is not part of the graph at all — it is a different
// problem ("not deployed"), and listing it as isolated would blur the two.
eq(graph.unlinked.some((s) => s.name === "HamsterCheek"), false, "no-site project excluded from graph");

// One-way links are the actionable finding, so they must be distinguishable.
const oneWay = buildAtlasGraph([
  { projectId: "a", name: "A", liveUrl: "https://a.test", outboundHosts: ["b.test"] },
  { projectId: "b", name: "B", liveUrl: "https://b.test", outboundHosts: [] },
]);
eq(oneWay.edges.map((e) => e.reciprocal), [false], "A→B with no link back is not reciprocal");
eq(oneWay.unlinked.map((s) => s.name), ["A"], "A has no inbound link");

// An empty fleet must not throw.
eq(buildAtlasGraph([]), { edges: [], unlinked: [], deadEnds: [] }, "empty input");

console.log(`${pass}/${pass + fail} atlas cases passed`);
if (fail > 0) process.exit(1);
