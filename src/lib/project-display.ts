// Display helpers for project metadata shown on PUBLIC surfaces (hero, profile).
//
// The bulk GitHub-import flow stamped every project with a placeholder
// description ("Local repository imported from fleetcrown-ui"). It's dead text,
// not signal — never show it. Until real descriptions are backfilled, treat the
// stub as empty so public surfaces stay clean instead of repeating it N times.

const PLACEHOLDER_DESCRIPTIONS = new Set([
  "local repository imported from fleetcrown-ui",
  "local repository imported from fleetcrown",
  "local repository",
  "imported from fleetcrown-ui",
]);

/** Real description, or null when it's empty / the import placeholder. */
export function cleanDescription(desc: string | null | undefined): string | null {
  const d = desc?.trim();
  if (!d) return null;
  return PLACEHOLDER_DESCRIPTIONS.has(d.toLowerCase()) ? null : d;
}
