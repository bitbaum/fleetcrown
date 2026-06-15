/**
 * Canonical project-name normalization — SSOT for project registration.
 *
 * Mirrors normalizeUsername (lib/username.ts). Without this, project names
 * drifted between deployments — the local dev DB held Title-case names
 * ("FleetCrown", "Revamp-Info", "AOZ") while the production box held lowercase
 * slugs ("fleetcrown", "revamp-info", "aoz-housing"), so the same project read
 * differently in the web app vs the desktop. Enforcing one canonical form on
 * every registration keeps the registry consistent going forward.
 *
 * Zellij tab matching is already case-insensitive (see lib/terminals/zellij.ts),
 * so a lowercase canonical name still resolves a PascalCase tab.
 */
export function normalizeProjectName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}
