import type { ProjectGridRow } from "@/components/projects/ProjectGridCard";
import { hasProjectAttention } from "@/lib/projects-page-stats";

/** Case-insensitive grouping key for project names within one user. */
export function projectNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface ProjectEntityScoreInput {
  id: string;
  name: string;
  description?: string | null;
  gitUrl?: string | null;
  attrs: Record<string, string>;
  readonly?: boolean;
  dirPath?: string | null;
}

/** Higher score wins when merging duplicate project entities. */
export function scoreProjectEntity(row: ProjectEntityScoreInput): number {
  let score = 0;
  if (row.description?.trim()) score += 10;
  if (row.gitUrl) score += 5;
  if (row.dirPath) score += 3;
  if (hasProjectAttention(row.attrs)) score += 4;
  if (row.attrs["next_step"]?.trim()) score += 2;
  score += Object.keys(row.attrs).length;
  if (!row.readonly) score += 20;
  return score;
}

export function pickCanonicalProject<T extends ProjectEntityScoreInput>(rows: T[]): T {
  if (rows.length === 0) throw new Error("pickCanonicalProject: empty group");
  return rows.reduce((best, cur) => (scoreProjectEntity(cur) > scoreProjectEntity(best) ? cur : best));
}

/** Safety net after DB merge — team rows never collapse with owned rows. */
export function mergeDuplicateProjectRows(projects: ProjectGridRow[]): ProjectGridRow[] {
  const byKey = new Map<string, ProjectGridRow>();
  for (const p of projects) {
    const key = p.readonly ? `team:${p.id}` : projectNameKey(p.name);
    const existing = byKey.get(key);
    if (!existing || scoreProjectEntity(p) > scoreProjectEntity(existing)) {
      byKey.set(key, p);
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
