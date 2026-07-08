import type { ProjectResource } from "@/db/schema/user-projects";

export type ShareAudience = "advisor" | "team" | "public";

export function isResourceVisibleInShare(resource: ProjectResource, audience: ShareAudience): boolean {
  const sensitivity = resource.sensitivity ?? "normal";
  if (sensitivity === "secret" || sensitivity === "credential") return false;
  if (resource.kind === "credential" || resource.kind === "environment") return false;

  const visibility = resource.visibility ?? "private";
  if (audience === "public") return visibility === "public";
  return visibility === "public" || visibility === "team";
}
