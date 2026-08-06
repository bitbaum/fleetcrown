/**
 * The fleet link graph — which of your sites actually reach each other.
 *
 * Every edge here is OBSERVED (a real <a href> found on a real page), never
 * declared. That is the whole point: a declared graph tells you what you meant
 * to build, an observed one tells you that solon.orangecat.ch has been live for
 * weeks and nothing on the fleet links to it. Synergies you already have are
 * cheap to list; the value is in the ones you think you have and don't.
 *
 * Pure functions — no DB, no network — so the analysis is unit-tested.
 */

export type AtlasSiteInput = {
  projectId: string;
  name: string;
  liveUrl: string | null;
  outboundHosts: string[];
};

export type AtlasEdge = {
  fromProjectId: string;
  fromName: string;
  toProjectId: string;
  toName: string;
  /** True when the target links back. One-way edges are the actionable ones. */
  reciprocal: boolean;
};

export type AtlasGraph = {
  edges: AtlasEdge[];
  /** Live sites no other fleet site links to — unreachable from your own network. */
  unlinked: { projectId: string; name: string }[];
  /** Live sites that link out to no other fleet site — they receive but never pass on. */
  deadEnds: { projectId: string; name: string }[];
};

export function hostOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Treat `www.example.com` and `example.com` as the same site. Without this a
 * link to the canonical www host reads as a link off-fleet, and the flagship
 * site shows up as "unlinked" while everything links to it.
 */
function canonicalHost(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

export function buildAtlasGraph(sites: AtlasSiteInput[]): AtlasGraph {
  const live = sites.filter((s) => hostOfUrl(s.liveUrl) !== null);

  // host → project. Built from live_url values, so the definition of "a fleet
  // site" has exactly one source: the projects the user registered.
  const byHost = new Map<string, AtlasSiteInput>();
  for (const site of live) {
    const host = hostOfUrl(site.liveUrl);
    if (host) byHost.set(canonicalHost(host), site);
  }

  const linksTo = new Map<string, Set<string>>();
  for (const site of live) {
    const targets = new Set<string>();
    for (const rawHost of site.outboundHosts) {
      const target = byHost.get(canonicalHost(rawHost.toLowerCase()));
      if (target && target.projectId !== site.projectId) targets.add(target.projectId);
    }
    linksTo.set(site.projectId, targets);
  }

  const edges: AtlasEdge[] = [];
  for (const site of live) {
    for (const toId of linksTo.get(site.projectId) ?? []) {
      const target = live.find((s) => s.projectId === toId);
      if (!target) continue;
      edges.push({
        fromProjectId: site.projectId,
        fromName: site.name,
        toProjectId: target.projectId,
        toName: target.name,
        reciprocal: linksTo.get(toId)?.has(site.projectId) ?? false,
      });
    }
  }
  edges.sort((a, b) => a.fromName.localeCompare(b.fromName) || a.toName.localeCompare(b.toName));

  const inboundCount = new Map<string, number>();
  for (const edge of edges) {
    inboundCount.set(edge.toProjectId, (inboundCount.get(edge.toProjectId) ?? 0) + 1);
  }

  const unlinked = live
    .filter((s) => (inboundCount.get(s.projectId) ?? 0) === 0)
    .map((s) => ({ projectId: s.projectId, name: s.name }));

  const deadEnds = live
    .filter((s) => (linksTo.get(s.projectId)?.size ?? 0) === 0)
    .map((s) => ({ projectId: s.projectId, name: s.name }));

  return { edges, unlinked, deadEnds };
}
