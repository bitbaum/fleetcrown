// Verifies the Atlas pure cores: site metadata parsing (src/lib/atlas/probe.ts)
// and the observed link graph (src/lib/atlas/graph.ts). Both run without a
// network or a DB — the fragile parts are the ones worth pinning.
// Run: npx tsx scripts/test/atlas.ts
import { parseSiteHtml, isImageResponse } from "@/lib/atlas/probe";
import { buildAtlasGraph, type AtlasSiteInput } from "@/lib/atlas/graph";
import { suggestFleetLinks } from "@/lib/atlas/suggest";

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
eq(full.internalPaths, ["/internal"], "same-site links become paths; mailto ignored");

// The page map must be a list of DESTINATIONS. Assets, queries, fragments and
// trailing slashes all collapse — otherwise one page appears four times.
const mapNoise = parseSiteHtml(
  `<body>
     <a href="/pricing">p</a>
     <a href="/pricing/">p slash</a>
     <a href="/pricing?ref=x">p query</a>
     <a href="/pricing#plans">p hash</a>
     <a href="/logo.png">img</a>
     <a href="/styles.css">css</a>
     <a href="/feed.xml">feed</a>
     <a href="/docs/quickstart">docs</a>
     <a href="/">home</a>
   </body>`,
  BASE,
);
eq(mapNoise.internalPaths, ["/", "/docs/quickstart", "/pricing"], "paths deduped; assets dropped; query/hash/slash normalized");

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
eq(selfOnly.internalPaths, ["/a", "/b"], "own-host links are the site map, not outbound");

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

// ── isImageResponse ─────────────────────────────────────────────────────────
// A preview is only real if a crawler gets image bytes back. These cases are
// the exact shapes found live across the fleet, so a regression here would let
// a blank-sharing site read as fine again.
eq(isImageResponse(200, "image/png"), true, "200 + image/png is a real preview");
eq(isImageResponse(200, "image/jpeg; charset=binary"), true, "parameters after the type are ignored");
eq(isImageResponse(200, "IMAGE/PNG"), true, "content-type match is case-insensitive");
eq(isImageResponse(200, " image/webp"), true, "leading whitespace tolerated");
eq(isImageResponse(404, "image/png"), false, "404 is broken even with an image type");
eq(isImageResponse(500, "image/png"), false, "5xx is broken");
eq(isImageResponse(200, "text/html; charset=utf-8"), false, "an HTML error page is NOT a preview");
eq(isImageResponse(200, null), false, "missing content-type is not assumed to be an image");
eq(isImageResponse(200, ""), false, "empty content-type is not an image");
eq(isImageResponse(301, "image/png"), true, "a followed redirect still counts");

// ── suggestFleetLinks ───────────────────────────────────────────────────────
// Every suggestion must be backed by an observation. These cases pin that the
// engine proposes nothing it cannot justify — a wall of plausible guesses would
// be worse than the empty state it replaces.
const S = (id: string, hosts: string[]): AtlasSiteInput => ({
  projectId: id, name: id, liveUrl: `https://${id}.test`, outboundHosts: hosts,
});

const recip = suggestFleetLinks([S("a", ["b.test"]), S("b", [])]);
eq(recip.length, 1, "one suggestion for a one-way edge");
eq(recip[0].kind, "reciprocate", "an existing one-way link suggests linking back");
eq(recip[0].fromName, "b", "the suggestion is addressed to the site that does NOT link back");
eq(recip[0].toName, "a", "...pointing at the one that already links to it");

// A link that already exists in both directions is not a suggestion.
eq(suggestFleetLinks([S("a", ["b.test"]), S("b", ["a.test"])]), [], "reciprocal pair suggests nothing");

// Shared audience: a rare third-party host both sites point at.
const shared = suggestFleetLinks([S("a", ["partner.test"]), S("b", ["partner.test"]), S("c", []), S("d", []), S("e", []), S("f", [])]);
eq(
  shared.filter((s) => s.kind === "shared-audience").map((s) => `${s.fromName}->${s.toName}`),
  ["a->b", "b->a"],
  "a rare shared host suggests a link both ways",
);
eq(
  shared.some((s) => s.kind === "shared-audience" && s.reason.includes("partner.test")),
  true,
  "the shared host is named in the reason, so the claim is auditable",
);

// ...but a host almost everyone links to is plumbing, not an audience. Without
// this guard every pair would "share an audience" via github.com.
const plumbing = suggestFleetLinks([S("a", ["github.com"]), S("b", ["github.com"]), S("c", ["github.com"])]);
eq(
  plumbing.some((s) => s.kind === "shared-audience"),
  false,
  "a host most of the fleet links to is NOT treated as a shared audience",
);

// Regression from real fleet data: github.com alone produced 18 of 28
// suggestions. Even shared by exactly two sites it must never be a signal.
eq(
  suggestFleetLinks([S("a", ["github.com"]), S("b", ["github.com"])]).some(
    (s) => s.kind === "shared-audience",
  ),
  false,
  "github.com is never audience evidence, even when only two sites link it",
);

// The rarity rule must also reject a non-infrastructure host once it is common.
const common = Array.from({ length: 16 }, (_, i) => S(`s${i}`, ["everywhere.test"]));
eq(
  suggestFleetLinks(common).some((s) => s.kind === "shared-audience"),
  false,
  "a host linked by the whole fleet is not discriminating, denylist or not",
);

// Orphans get a concrete host for the link rather than a bare complaint.
const orphan = suggestFleetLinks([S("a", ["b.test"]), S("b", ["a.test"]), S("lonely", [])]);
const forLonely = orphan.filter((s) => s.toName === "lonely");
eq(forLonely.length, 1, "an isolated site gets exactly one suggested home");
eq(forLonely[0].kind, "orphan", "...classified as unreachable");

// A site with no live URL is not part of the fleet graph at all.
eq(
  suggestFleetLinks([{ projectId: "x", name: "x", liveUrl: null, outboundHosts: [] }]),
  [],
  "a project with no site yields no suggestions",
);
eq(suggestFleetLinks([]), [], "empty fleet suggests nothing");

console.log(`${pass}/${pass + fail} atlas cases passed`);
if (fail > 0) process.exit(1);
