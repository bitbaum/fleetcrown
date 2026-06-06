/**
 * Project-profile lookup — SSOT.
 *
 * /control needs to attach a "profile" (description, status, maturity,
 * stack, mission, attrs blob) to each Zellij tab + dir pair it shows.
 * Match order:
 *   1. If the tab is linked to an entity_project_id (best signal), look up
 *      by id.
 *   2. Otherwise fuzzy-match the project's `name` field against the tab
 *      name and the dir's basename, case-insensitive and with `_`/`-`
 *      stripped so "fleet-crown", "fleetCrown", and "fleet_crown" all
 *      match "FleetCrown".
 *
 * Pre-extraction this logic lived inline in api/control/route.ts in three
 * near-identical functions (matchProfile / matchProfileById /
 * resolveAutoInjectOverride). They had slightly different fuzzy-match
 * details — matchProfile did substring matches in both directions,
 * resolveAutoInjectOverride only did exact-normalized matches. That
 * divergence was an accident, not a feature: a user with a slightly-
 * different tab spelling could see their profile attach but the autopilot
 * override fail to resolve. This module makes the fuzzy match a single
 * function so the two callers see the same answer.
 *
 * Two consumers right now: the /control route's GET handler, and the
 * /api/inject route's project-resolution step. If we add more (cron,
 * /projects page), they import from here too.
 */

import path from "path";
import type { ProjectRow } from "@/db/queries/projects";
import type { ProjectProfile } from "@/lib/control-types";
import { AUTO_INJECT_MODE_VALUES, type AutoInjectMode } from "@/config/beacon";

/** Normalize a name for fuzzy matching: lowercase + strip `_` and `-` so
 *  variant spellings of the same project collapse to one form. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, "");
}

/** Map a raw projects-table row to the wire shape /control returns. The
 *  `attrs` JSONB blob is the canonical storage; the top-level fields
 *  (description / status / maturity etc.) are mirrors that the UI reads
 *  directly so the same fact lives in exactly one place per row. */
export function rowToProfile(row: ProjectRow): ProjectProfile {
  const a = row.attrs as Record<string, string>;
  return {
    description: row.description ?? a.description ?? "",
    status: a.status ?? "",
    maturity: a.maturity ?? "",
    stack: a.stack ?? a.stack_layer ?? "",
    url: a.url ?? "",
    mission: a.mission ?? "",
    attrs: a,
  };
}

/** Fuzzy-match a tab/dir pair against a list of project rows. Returns
 *  the matching row's projected ProjectProfile, or null. */
export function matchProfile(
  tab: string,
  dir: string,
  dbProjects: ProjectRow[],
): ProjectProfile | null {
  const tabLower = normalizeName(tab);
  const dirBaseLower = normalizeName(path.basename(dir));
  const match = dbProjects.find((p) => {
    const n = normalizeName(p.name);
    return (
      n === tabLower || n === dirBaseLower ||
      n.includes(tabLower) || tabLower.includes(n) ||
      n.includes(dirBaseLower) || dirBaseLower.includes(n)
    );
  });
  return match ? rowToProfile(match) : null;
}

/** Exact-by-id project lookup. Used when the runtime already knows which
 *  entity_project this tab belongs to (link table writeback). */
export function matchProfileById(
  entityProjectId: string | null,
  dbProjects: ProjectRow[],
): ProjectProfile | null {
  if (!entityProjectId) return null;
  const match = dbProjects.find((p) => p.id === entityProjectId);
  return match ? rowToProfile(match) : null;
}

/** Resolve the per-project autopilot override for a tab. Returns null if no
 *  match or if the stored value isn't a known AutoInjectMode (the column has
 *  no CHECK constraint; the typeguard happens here at the API boundary so
 *  consumers can trust the value). Lookup mirrors matchProfile — by entity
 *  id when known, otherwise fuzzy match on tab/dir basename. */
export function resolveAutoInjectOverride(
  entityProjectId: string | null,
  tab: string,
  dir: string,
  dbProjects: ProjectRow[],
): AutoInjectMode | null {
  let match: ProjectRow | undefined;
  if (entityProjectId) {
    match = dbProjects.find((p) => p.id === entityProjectId);
  }
  if (!match) {
    const tabLower = normalizeName(tab);
    const dirBaseLower = normalizeName(path.basename(dir));
    match = dbProjects.find((p) => {
      const n = normalizeName(p.name);
      return n === tabLower || n === dirBaseLower;
    });
  }
  const stored = match?.autoInjectModeOverride ?? null;
  if (!stored) return null;
  return AUTO_INJECT_MODE_VALUES.includes(stored as AutoInjectMode)
    ? (stored as AutoInjectMode)
    : null;
}
