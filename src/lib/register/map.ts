import type { RegisterRow } from "./build";

/**
 * The fleet MAP: the register (what exists, where it runs, where the code is)
 * plus what each project is for and what is happening on it right now.
 *
 * Why a second shape and not more columns on the register: the register is
 * the join of facts other systems own (apps.conf, the profile, OrangeCat,
 * Solon) and it is consumed as such. The map is what a reader — a person on
 * bitbaum, the assistant answering "what do we have", Cat on OrangeCat — needs
 * to orient: one line of purpose, a layer, a state, and the last thing that
 * moved. Both come from the same rows, so they cannot disagree; the map only
 * adds the activity columns Loki alone can see (runs, dev log, goals).
 *
 * Pure. All I/O happens in the route; this is unit-tested without a database.
 */

export type MapLayer =
  "economic" | "capability" | "governance" | "client" | "product" | "demo" | "next";

export type FleetMapEntry = {
  slug: string;
  name: string;
  /** One line: what the project IS. Null when nobody has written it yet. */
  what: string | null;
  stack: string | null;
  layer: MapLayer;
  /** "live" | "demo" | "prospect" | "retired" | … from apps.conf, or "not live". */
  status: string;
  /** Who it is for: "bitbaum" = ours; anything else is a client. */
  owner: string;
  since: string | null;
  urls: {
    live: string | null;
    repo: string | null;
    orangecat: string | null;
    solon: string | null;
  };
  /** The project's own declared next step, from its dev log. */
  next: string | null;
  now: {
    openRuns: number;
    lastRun: { outcome: string; at: string } | null;
    lastLog: { date: string; done: string } | null;
  };
};

export type FleetMap = {
  generatedAt: string;
  thesis: string;
  pillars: Array<{ slug: string; layer: MapLayer; role: string }>;
  summary: { projects: number; live: number; clients: number; inFlight: number };
  projects: FleetMapEntry[];
};

/** The three pillars: one thesis, three products, honest seams between them. */
export const PILLARS: ReadonlyArray<{ slug: string; layer: MapLayer; role: string }> = [
  {
    slug: "orangecat",
    layer: "economic",
    role: "Move value: identity, entities, Bitcoin settlement, the economy that remembers need.",
  },
  {
    slug: "loki",
    layer: "capability",
    role: "Get work built: a captain over a fleet of agents, with verification and approval built in.",
  },
  {
    slug: "solon",
    layer: "governance",
    role: "Coordinate without a coercive state: signed voting, transparent treasury, rules people can recount.",
  },
];

export const THESIS =
  "One person plus Bitcoin, an AI fleet and cryptographic governance replaces the permission a corporation, bank, platform or state would otherwise grant.";

export type MapActivity = {
  openRuns: number;
  lastRun: { outcome: string; at: Date } | null;
};

export type MapProfile = {
  stack?: string | null;
  devLog?: Array<{ date: string; done?: string | null; next?: string | null }> | null;
};

const OWN = new Set(["bitbaum", "-", ""]);

export function layerFor(row: RegisterRow): MapLayer {
  const pillar = PILLARS.find((p) => p.slug === row.slug);
  if (pillar) return pillar.layer;
  const s = row.site;
  if (!s) return "next";
  if (s.kind === "demo" || s.status === "demo") return "demo";
  if (!OWN.has(s.owner)) return "client";
  if (s.status !== "live") return "next";
  return "product";
}

function orangecatUrl(row: RegisterRow): string | null {
  return row.orangecat ? `https://orangecat.ch/projects/${row.orangecat.projectId}` : null;
}

function solonUrl(row: RegisterRow): string | null {
  return row.solon ? `https://solon.orangecat.ch/orgs/${row.solon.slug}` : null;
}

function repoUrl(row: RegisterRow): string | null {
  return row.repo ? `https://github.com/bitbaum/${row.repo}` : null;
}

export function buildFleetMap(
  rows: RegisterRow[],
  profiles: ReadonlyMap<string, MapProfile>,
  activity: ReadonlyMap<string, MapActivity>,
  now: Date = new Date(),
): FleetMap {
  const projects: FleetMapEntry[] = rows.map((row) => {
    const profile = profiles.get(row.slug);
    const act = activity.get(row.slug);
    const log = [...(profile?.devLog ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return {
      slug: row.slug,
      name: row.name,
      what: row.description,
      stack: profile?.stack?.trim() || null,
      layer: layerFor(row),
      status: row.site?.status ?? "not live",
      owner: row.site?.owner ?? "bitbaum",
      since: row.site?.since && row.site.since !== "-" ? row.site.since : null,
      urls: {
        live: row.site?.url ?? row.loki?.liveUrl ?? null,
        repo: repoUrl(row),
        orangecat: orangecatUrl(row),
        solon: solonUrl(row),
      },
      next: log?.next?.trim() || null,
      now: {
        openRuns: act?.openRuns ?? 0,
        lastRun: act?.lastRun
          ? { outcome: act.lastRun.outcome, at: act.lastRun.at.toISOString() }
          : null,
        lastLog: log?.done ? { date: log.date, done: log.done.trim() } : null,
      },
    };
  });

  // Pillars first, then live products, then clients, demos, the rest — a map
  // reads top-down, so the shape of the studio is the first thing seen.
  const rank: Record<MapLayer, number> = {
    economic: 0,
    capability: 0,
    governance: 0,
    product: 1,
    client: 2,
    demo: 3,
    next: 4,
  };
  projects.sort((a, b) => rank[a.layer] - rank[b.layer] || a.slug.localeCompare(b.slug));

  return {
    generatedAt: now.toISOString(),
    thesis: THESIS,
    pillars: [...PILLARS],
    summary: {
      projects: projects.length,
      live: projects.filter((p) => p.status === "live").length,
      clients: projects.filter((p) => p.layer === "client").length,
      inFlight: projects.reduce((n, p) => n + p.now.openRuns, 0),
    },
    projects,
  };
}

/**
 * One line per project — the overview the assistant retrieves for "what do we
 * have?". Facts only, in a fixed order, so the same map always embeds the same.
 */
export function renderFleetMapOverview(map: FleetMap): string {
  const lines = [
    `Fleet map (${map.summary.projects} projects, ${map.summary.live} live, ${map.summary.clients} client systems). ${map.thesis}`,
    ...map.pillars.map((p) => `Pillar ${p.slug} (${p.layer} layer): ${p.role}`),
    ...map.projects.map((p) => {
      const bits = [
        `${p.slug} — ${p.what ?? "(no description yet)"}`,
        `${p.layer}, ${p.status}${p.owner !== "bitbaum" ? `, for ${p.owner}` : ""}`,
        p.urls.live ? `live at ${p.urls.live}` : null,
        p.urls.repo ? `code ${p.urls.repo}` : null,
        p.now.lastLog ? `last log ${p.now.lastLog.date}: ${p.now.lastLog.done}` : null,
        p.next ? `next: ${p.next}` : null,
      ].filter(Boolean);
      return bits.join("; ");
    }),
  ];
  return lines.join("\n");
}
