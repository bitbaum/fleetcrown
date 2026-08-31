import type { ProjectGridRow } from "@/components/projects/project-grid-row";
import { PROJECT_ATTR } from "@/config/project-attrs";
import { hasAnswer } from "@/lib/project-display";

export type ProjectsPageFilter = null | "attention" | "next-step" | "team";

export function isSiteDown(project: Pick<ProjectGridRow, "liveUrl" | "siteOk">): boolean {
  return Boolean(project.liveUrl) && project.siteOk === false;
}

export interface ProjectsPageStats {
  total: number;
  attention: number;
  withNextStep: number;
  team: number;
  own: number;
}

/** Attr keys that flag a project as needing attention on the Projects page. */
const ATTENTION_KEYS = [
  PROJECT_ATTR.SECURITY_VULNERABILITY,
  PROJECT_ATTR.BROKEN_FEATURES,
  PROJECT_ATTR.DEPLOYMENT_ISSUE,
] as const;

export function hasProjectAttention(
  project: Pick<ProjectGridRow, "attrs" | "liveUrl" | "siteOk">,
): boolean {
  return ATTENTION_KEYS.some((k) => Boolean(project.attrs[k])) || isSiteDown(project);
}

export function computeProjectsPageStats(projects: ProjectGridRow[]): ProjectsPageStats {
  let attention = 0;
  let withNextStep = 0;
  let team = 0;

  for (const p of projects) {
    if (p.readonly) team += 1;
    if (hasProjectAttention(p)) attention += 1;
    if (hasAnswer(p.attrs[PROJECT_ATTR.NEXT_STEP])) withNextStep += 1;
  }

  return {
    total: projects.length,
    attention,
    withNextStep,
    team,
    own: projects.length - team,
  };
}

export function filterProjects(
  projects: ProjectGridRow[],
  query: string,
  pageFilter: ProjectsPageFilter,
): ProjectGridRow[] {
  const q = query.trim().toLowerCase();

  const result = projects.filter((p) => {
    if (pageFilter === "team" && !p.readonly) return false;
    if (pageFilter === "attention" && !hasProjectAttention(p)) return false;
    if (pageFilter === "next-step" && !hasAnswer(p.attrs[PROJECT_ATTR.NEXT_STEP])) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q) ||
      Object.values(p.attrs).some((v) => v.toLowerCase().includes(q))
    );
  });

  return result.sort((a, b) => {
    const aHasIssues = hasProjectAttention(a);
    const bHasIssues = hasProjectAttention(b);
    if (aHasIssues !== bHasIssues) return aHasIssues ? -1 : 1;
    const aHasNext = hasAnswer(a.attrs[PROJECT_ATTR.NEXT_STEP]);
    const bHasNext = hasAnswer(b.attrs[PROJECT_ATTR.NEXT_STEP]);
    if (aHasNext !== bHasNext) return aHasNext ? -1 : 1;
    if (a.readonly !== b.readonly) return a.readonly ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
