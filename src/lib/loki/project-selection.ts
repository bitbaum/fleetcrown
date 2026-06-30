import type { LokiProject } from "@/components/loki/types";

/** Match a project name from URL/search (case-insensitive slug). Client-safe. */
export function resolveLokiProjectSelection(
  projects: LokiProject[],
  needle: string | null | undefined,
): string[] {
  const q = needle?.trim();
  if (!q) return projects.length === 1 ? [projects[0].name] : [];
  const hit = projects.find((p) => p.name.toLowerCase() === q.toLowerCase());
  return hit ? [hit.name] : [];
}
