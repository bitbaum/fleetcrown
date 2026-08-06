import { cleanDescription } from "@/lib/project-display";

export type OrangeCatProjectPayload = {
  title: string;
  description: string;
  status: "active";
  website_url?: string;
};

/**
 * The public projection of a FleetCrown project.
 *
 * Deliberately lossy (bridge spec Part C): OC gets what the public should see;
 * gitUrl/dirPath/agent prefs stay FleetCrown-private.
 *
 * `website_url` used to be hardcoded to FleetCrown's own dashboard, so every
 * project ever published claimed fleetcrown.orangecat.ch/projects as its
 * website — a visitor clicking "Bitbaum"'s website link landed on a FleetCrown
 * page they cannot even read. The field is now omitted unless we know the
 * project's real site: no website is a true statement, someone else's website
 * is not.
 *
 * Pure so this mapping is testable — the bug it replaces was invisible for as
 * long as it was buried in a fetch body.
 */
export function buildOrangeCatProjectPayload(project: {
  name: string;
  description: string | null;
  liveUrl: string | null;
}): OrangeCatProjectPayload {
  return {
    title: project.name,
    description: cleanDescription(project.description) ?? "Built in public with FleetCrown.",
    status: "active",
    ...(project.liveUrl ? { website_url: project.liveUrl } : {}),
  };
}
