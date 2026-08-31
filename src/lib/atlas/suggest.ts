/**
 * What to actually DO about an isolated fleet.
 *
 * `buildAtlasGraph` answers "which of my sites reach each other" — and for this
 * fleet the answer is "almost none". That is a diagnosis with no cure: a list of
 * 13 isolated sites tells you the problem and leaves you to invent every fix.
 *
 * This module turns that into concrete proposals. The hard rule is that every
 * suggestion must cite OBSERVED evidence and say what it is, because a
 * suggestion you cannot audit is indistinguishable from a guess — and a wall of
 * plausible guesses is worse than the honest empty state it replaced. Nothing
 * here invents a relationship: it either already exists in one direction, or two
 * sites demonstrably point at the same place, or the site is genuinely orphaned.
 *
 * Pure — no DB, no network, no model calls — so every proposal is reproducible
 * and unit-testable.
 */

import { hostOfUrl, type AtlasSiteInput } from "./graph";

export type LinkSuggestionKind = "reciprocate" | "shared-audience" | "orphan";

export type LinkSuggestion = {
  fromProjectId: string;
  fromName: string;
  /** Where the link should be ADDED. Null when that site has no live URL. */
  fromUrl: string | null;
  toProjectId: string;
  toName: string;
  /** What the link should point AT. */
  toUrl: string | null;
  kind: LinkSuggestionKind;
  /** Plain-English evidence, shown verbatim in the UI. Never a guess. */
  reason: string;
};

/** Strongest first — the order suggestions are worth acting on. */
const RANK: Record<LinkSuggestionKind, number> = {
  reciprocate: 0,
  "shared-audience": 1,
  orphan: 2,
};

function canonicalHost(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Hosts that carry no audience information no matter how few sites link them.
 * Code hosting, fonts, analytics and social profiles appear on sites that have
 * nothing whatsoever to do with each other, so "both link to github.com" is a
 * fact about how software is built, not about who reads these two sites.
 *
 * This is a floor, not the mechanism — the rarity rule below does the real
 * work. It exists because the single most likely coincidence between any two of
 * these sites is precisely a code host.
 */
const INFRASTRUCTURE_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "codeberg.org",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "vercel.com",
  "nextjs.org",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "instagram.com",
  "facebook.com",
]);

/**
 * A shared host is evidence only if it is DISCRIMINATING — a host linked by a
 * large share of the fleet says nothing about any particular pair.
 *
 * The first version of this allowed up to a third of the fleet, and on the real
 * data that let github.com (5 of 15 sites) generate 18 of 28 suggestions: a
 * panel of confident noise, which is worse than the empty state it replaced.
 * Two sites out of fifteen is a coincidence worth surfacing; five is a habit.
 */
function isAudienceSignal(host: string, siteCount: number, liveCount: number): boolean {
  if (siteCount < 2) return false;
  if (INFRASTRUCTURE_HOSTS.has(host)) return false;
  return siteCount <= Math.max(2, Math.floor(liveCount / 8));
}

export function suggestFleetLinks(sites: AtlasSiteInput[]): LinkSuggestion[] {
  const live = sites.filter((s) => hostOfUrl(s.liveUrl) !== null);

  const byHost = new Map<string, AtlasSiteInput>();
  for (const site of live) {
    const host = hostOfUrl(site.liveUrl);
    if (host) byHost.set(canonicalHost(host), site);
  }

  // Fleet-internal adjacency, plus the off-fleet hosts each site points at.
  const linksTo = new Map<string, Set<string>>();
  const offFleet = new Map<string, Set<string>>();
  for (const site of live) {
    const internal = new Set<string>();
    const external = new Set<string>();
    for (const raw of site.outboundHosts) {
      const host = canonicalHost(raw.toLowerCase());
      const target = byHost.get(host);
      if (target && target.projectId !== site.projectId) internal.add(target.projectId);
      else if (!target) external.add(host);
    }
    linksTo.set(site.projectId, internal);
    offFleet.set(site.projectId, external);
  }

  const has = (from: string, to: string) => linksTo.get(from)?.has(to) ?? false;
  const suggestions: LinkSuggestion[] = [];
  const seen = new Set<string>();

  function propose(
    from: AtlasSiteInput,
    to: AtlasSiteInput,
    kind: LinkSuggestionKind,
    reason: string,
  ) {
    const key = `${from.projectId}->${to.projectId}`;
    // A link that already exists is not a suggestion, and the first (strongest)
    // reason for a pair wins — restating the same edge under a weaker rationale
    // would inflate the list without adding information.
    if (from.projectId === to.projectId || has(from.projectId, to.projectId) || seen.has(key))
      return;
    seen.add(key);
    suggestions.push({
      fromProjectId: from.projectId,
      fromName: from.name,
      fromUrl: from.liveUrl,
      toProjectId: to.projectId,
      toName: to.name,
      toUrl: to.liveUrl,
      kind,
      reason,
    });
  }

  // 1. Reciprocate — the only suggestion backed by an existing link. If A already
  //    points at B, B's audience is already being sent to it one-way.
  for (const from of live) {
    for (const toId of linksTo.get(from.projectId) ?? []) {
      const target = live.find((s) => s.projectId === toId);
      if (!target || has(toId, from.projectId)) continue;
      propose(
        target,
        from,
        "reciprocate",
        `${from.name} already links to ${target.name}, but not the other way round.`,
      );
    }
  }

  // 2. Shared audience — two sites point at the same uncommon third party.
  const hostUsers = new Map<string, AtlasSiteInput[]>();
  for (const site of live) {
    for (const host of offFleet.get(site.projectId) ?? []) {
      const list = hostUsers.get(host) ?? [];
      list.push(site);
      hostUsers.set(host, list);
    }
  }
  for (const [host, users] of [...hostUsers.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isAudienceSignal(host, users.length, live.length)) continue;
    for (const a of users) {
      for (const b of users) {
        if (a.projectId === b.projectId) continue;
        propose(a, b, "shared-audience", `Both ${a.name} and ${b.name} link to ${host}.`);
      }
    }
  }

  // 3. Orphans — nothing on the fleet reaches them and they reach nothing.
  //
  //    Where should the link go? Rank by INBOUND links first, not outbound: the
  //    goal is for the orphan to be *seen*, so the best host is the site
  //    visitors already arrive at. Outbound is the tie-break, because a site
  //    that already links somewhere has a place to put another one.
  //
  //    On a small fleet the top candidates are often tied (here two sites have
  //    one inbound link each), so the wording below says "best-connected"
  //    rather than claiming a winner the data does not support.
  const inbound = new Map<string, number>();
  for (const site of live) {
    for (const toId of linksTo.get(site.projectId) ?? []) {
      inbound.set(toId, (inbound.get(toId) ?? 0) + 1);
    }
  }
  const connectors = [...live].sort(
    (a, b) =>
      (inbound.get(b.projectId) ?? 0) - (inbound.get(a.projectId) ?? 0) ||
      (linksTo.get(b.projectId)?.size ?? 0) - (linksTo.get(a.projectId)?.size ?? 0) ||
      a.name.localeCompare(b.name),
  );
  const hub = connectors.find((s) => (linksTo.get(s.projectId)?.size ?? 0) > 0);

  for (const site of live) {
    const isolated =
      (inbound.get(site.projectId) ?? 0) === 0 && (linksTo.get(site.projectId)?.size ?? 0) === 0;
    if (!isolated) continue;
    const from = hub && hub.projectId !== site.projectId ? hub : null;
    if (!from) continue;
    propose(
      from,
      site,
      "orphan",
      `Nothing on the fleet links to ${site.name}, and it links to nothing back. ${from.name} is your best-connected site, so a link there is the cheapest way to make it reachable.`,
    );
  }

  suggestions.sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      a.fromName.localeCompare(b.fromName) ||
      a.toName.localeCompare(b.toName),
  );
  return suggestions;
}
