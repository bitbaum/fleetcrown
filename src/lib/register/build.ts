// The fleet register: one row per project, joined across the four surfaces.
//
// Why this exists: "which projects do we have, and which has a site, a
// FleetCrown profile, an OrangeCat profile, a Solon profile" was answered by
// SEVEN hand-kept lists that disagreed (apps.conf, this database, OrangeCat's,
// Solon's, bitbaum's companies.json, the public footer, 24 markdown dossiers).
// None is wrong about its own facts; each is wrong about the others. This is
// the join, computed from the owners of each fact, not a copy of them.
//
// The join key is the CANONICAL SLUG — the repository name. Projects have
// drifted into several names (aoz-housing/aoz-wohnen, datacat/datacat-web,
// s-ink/sink, sbb-fundbuero/sbb-lost-found, wild-spirit/annushka). A join on
// raw names silently drops those; `canonicalSlug` folds them. The durable fix
// is the `slug` column on user_projects, which this honours first.

import type { HostedApp } from "./apps-conf";
import { hostedUrl } from "./apps-conf";

/** Older name → canonical repository name. Add here when a rename happens. */
export const SLUG_ALIASES: Readonly<Record<string, string>> = {
  "aoz-wohnen": "aoz-housing",
  "datacat-web": "datacat",
  sink: "s-ink",
  "sbb-lost-found": "sbb-fundbuero",
  annushka: "wild-spirit",
  "annushka-wild-spirit-art": "wild-spirit",
};

/** Lowercase, hyphenated, aliased. Pure. */
export function canonicalSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return SLUG_ALIASES[base] ?? base;
}

/** Repo name from a git URL, or null. */
export function repoFromGitUrl(gitUrl: string | null | undefined): string | null {
  if (!gitUrl) return null;
  const m = /\/([^/]+?)(?:\.git)?\/?$/.exec(gitUrl.trim());
  return m ? m[1] : null;
}

export type RegisterProjectInput = {
  id: string;
  name: string;
  slug?: string | null;
  hostedApp?: string | null;
  gitUrl?: string | null;
  liveUrl?: string | null;
  orangecatProjectId?: string | null;
  solonOrgSlug?: string | null;
  isActive?: boolean;
};

export type RegisterRow = {
  slug: string;
  name: string;
  repo: string | null;
  site: { url: string; host: string; kind: string; status: string; owner: string } | null;
  fleetcrown: { id: string; liveUrl: string | null } | null;
  orangecat: { projectId: string } | null;
  solon: { slug: string } | null;
};

/**
 * Join FleetCrown projects with the hosting register (and the stored links to
 * OrangeCat and Solon). Pure: no I/O, so the whole thing is unit-testable and
 * the API/page/footer cannot disagree — they call this.
 *
 * `solonOrgs`, when given, is the set of organisation slugs Solon reports;
 * a project counts as "on Solon" if its slug (or stored solonOrgSlug) is in it.
 */
export function buildFleetRegister(
  projects: RegisterProjectInput[],
  apps: HostedApp[],
  solonOrgs?: ReadonlySet<string>,
): RegisterRow[] {
  const bySlug = new Map<string, RegisterRow>();

  const row = (slug: string, name: string): RegisterRow => {
    let r = bySlug.get(slug);
    if (!r) {
      r = { slug, name, repo: null, site: null, fleetcrown: null, orangecat: null, solon: null };
      bySlug.set(slug, r);
    }
    return r;
  };

  for (const p of projects) {
    if (p.isActive === false) continue;
    const repo = repoFromGitUrl(p.gitUrl);
    // The stored slug wins; then the repo name (the canonical identity); then
    // the display name folded through the alias table.
    const slug = canonicalSlug(p.slug || repo || p.name);
    const r = row(slug, p.name);
    r.repo = r.repo ?? repo;
    r.fleetcrown = { id: p.id, liveUrl: p.liveUrl ?? null };
    if (p.orangecatProjectId) r.orangecat = { projectId: p.orangecatProjectId };
    if (p.solonOrgSlug) r.solon = { slug: p.solonOrgSlug };
    if (p.hostedApp) (r as RegisterRow & { hostedApp?: string }).hostedApp = p.hostedApp;
  }

  // Hosted apps attach by explicit hosted_app link first, else by canonical name.
  const byHosted = new Map<string, RegisterRow>();
  for (const r of bySlug.values()) {
    const h = (r as RegisterRow & { hostedApp?: string }).hostedApp;
    if (h) byHosted.set(h, r);
  }
  for (const a of apps) {
    const url = hostedUrl(a);
    if (!url) continue;
    const target = byHosted.get(a.name) ?? row(canonicalSlug(a.name), a.name);
    target.site = { url, host: a.domains[0], kind: a.kind, status: a.status, owner: a.owner };
  }

  if (solonOrgs) {
    for (const r of bySlug.values()) {
      if (!r.solon && solonOrgs.has(r.slug)) r.solon = { slug: r.slug };
    }
  }

  for (const r of bySlug.values()) delete (r as RegisterRow & { hostedApp?: string }).hostedApp;
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function summarize(rows: RegisterRow[]) {
  return {
    projects: rows.length,
    sites: rows.filter((r) => r.site).length,
    fleetcrown: rows.filter((r) => r.fleetcrown).length,
    orangecat: rows.filter((r) => r.orangecat).length,
    solon: rows.filter((r) => r.solon).length,
  };
}
