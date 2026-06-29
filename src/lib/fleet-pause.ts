/**
 * Batch-pause autopilot on selected fleet projects (per-project override → off).
 */
import { getUserProjects } from "@/db/queries/user-projects";
import { patchProject } from "@/db/queries/projects";

export type FleetPauseResult = {
  ok: boolean;
  paused: number;
  skipped: number;
  details: Array<{ projectKey: string; outcome: "paused" | "skipped"; reason?: string }>;
  message: string;
};

export async function pauseFleetProjects(
  userId: string,
  projectKeys: string[],
): Promise<FleetPauseResult> {
  const details: FleetPauseResult["details"] = [];
  const projects = await getUserProjects(userId);
  const wanted = new Set(projectKeys.map((k) => k.toLowerCase()));
  let paused = 0;
  let skipped = 0;

  for (const row of projects) {
    if (!wanted.has(row.name.toLowerCase())) continue;
    if (!row.entityProjectId) {
      skipped++;
      details.push({ projectKey: row.name, outcome: "skipped", reason: "no_entity" });
      continue;
    }
    const updated = await patchProject(userId, row.entityProjectId, {
      autoInjectModeOverride: "off",
    });
    if (!updated) {
      skipped++;
      details.push({ projectKey: row.name, outcome: "skipped", reason: "not_found" });
      continue;
    }
    paused++;
    details.push({ projectKey: row.name, outcome: "paused" });
  }

  const message =
    paused > 0
      ? `Paused autopilot on **${paused}** project${paused === 1 ? "" : "s"}.`
      : "No matching projects to pause.";

  return { ok: paused > 0, paused, skipped, details, message };
}
