/**
 * What you can ask the fleet register.
 *
 * The spec lives apart from the page because it is the honest statement of what
 * this list supports: five facets, three sorts, and the fields search looks at.
 * Adding a way to narrow the fleet is an edit here, not a new block of JSX —
 * which is the whole point of describing a list rather than hand-wiring one.
 */
import type { ListSpec } from "listkit";
import type { RegisterRow } from "@/lib/register/build";

/** The groups the page renders, derived from the register's own facts. */
export const GROUP_OPTIONS = ["live", "building", "profile"] as const;
export type FleetGroup = (typeof GROUP_OPTIONS)[number];

export const GROUP_LABEL: Record<FleetGroup, string> = {
  live: "Live",
  building: "Being built",
  profile: "Profile only",
};

/**
 * Which group a row belongs to.
 *
 * "Being built" is deliberately not called live. Nine of the addresses in this
 * register answer 200 with a six-to-seventeen kilobyte day-zero page — real
 * HTTP, nothing to read. The register records that as a status, and the page
 * has to carry the distinction or a reader clicks nine times into nothing.
 */
export function groupOf(r: RegisterRow): FleetGroup {
  if (!r.site) return "profile";
  return r.site.status === "live" || r.site.status === "demo" ? "live" : "building";
}

/** True when the address exists but has nothing on it yet. */
export function isDayZero(r: RegisterRow): boolean {
  return !!r.site && ["prospect", "validating", "unverified"].includes(r.site.status);
}

export const KIND_OPTIONS = ["product", "client-app", "client-site", "demo"] as const;
export const STATUS_OPTIONS = ["live", "validating", "prospect", "unverified", "demo"] as const;

export const SORT_LABEL: Record<string, string> = {
  name: "Name",
  newest: "Newest",
  complete: "Most complete",
  gaps: "Most gaps",
};

/** How many of the four places a project can exist in, it actually exists in. */
export function presenceScore(r: RegisterRow): number {
  return [r.site, r.fleetcrown, r.orangecat, r.solon].filter(Boolean).length;
}

export const FLEET_LIST: ListSpec<RegisterRow> = {
  facets: [
    {
      key: "group",
      kind: "many",
      value: (r) => groupOf(r),
      options: [...GROUP_OPTIONS],
    },
    { key: "kind", kind: "many", value: (r) => r.site?.kind ?? "", options: [...KIND_OPTIONS] },
    {
      key: "status",
      kind: "many",
      value: (r) => r.site?.status ?? "",
      options: [...STATUS_OPTIONS],
    },
    // Who it is for, as a facet: "show me the client work" is the first question
    // anyone asks a studio's project list. Options are supplied at call time
    // because the set of clients is data, not a constant.
    { key: "owner", kind: "many", value: (r) => r.site?.owner ?? "" },
    // The gap-finding facets. These are why the register is a to-do list read
    // sideways, and until now the only way to use it was to scan 38 rows.
    { key: "nosite", kind: "flag", value: (r) => !r.site },
    { key: "noorangecat", kind: "flag", value: (r) => !r.orangecat },
    { key: "nosolon", kind: "flag", value: (r) => !r.solon },
  ],
  search: {
    text: (r) => [r.name, r.slug, r.description, r.site?.host, r.site?.owner],
  },
  sorts: [
    { key: "name", by: [(r) => r.name ?? r.slug] },
    // Newest first, so `dir` defaults to descending for this one at the callsite.
    { key: "newest", by: [(r) => r.site?.since ?? null, (r) => r.name ?? r.slug] },
    { key: "complete", by: [(r) => -presenceScore(r), (r) => r.name ?? r.slug] },
    { key: "gaps", by: [(r) => presenceScore(r), (r) => r.name ?? r.slug] },
  ],
  defaultSort: "name",
  defaultPageSize: 100,
};

/** The spec with the owner options filled in from the rows actually present. */
export function fleetListFor(rows: readonly RegisterRow[]): ListSpec<RegisterRow> {
  const owners = [
    ...new Set(rows.map((r) => r.site?.owner).filter((o): o is string => !!o && o !== "-")),
  ].sort((a, b) => a.localeCompare(b));
  return {
    ...FLEET_LIST,
    facets: FLEET_LIST.facets.map((f) => (f.key === "owner" ? { ...f, options: owners } : f)),
  };
}
