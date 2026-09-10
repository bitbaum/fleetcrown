/** Resolve identity before deriving any worker transport label. Never fall back
 * to a same-named project when an explicit id is missing or inaccessible. */
export function findInjectProject<T extends { name: string; entityProjectId: string | null }>(
  projects: T[],
  name: string,
  projectId?: string,
): T | undefined {
  return projects.find((project) =>
    projectId
      ? project.entityProjectId === projectId
      : project.name.toLowerCase() === name.toLowerCase(),
  );
}
