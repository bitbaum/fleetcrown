import type { ProjectGridRow } from "@/components/projects/ProjectGridCard";

export type ProjectsPageFilter =
  | null
  | "attention"
  | "security"
  | "next-step"
  | "team"
  | "healthy";

export interface ProjectsPageStats {
  total: number;
  attention: number;
  security: number;
  healthy: number;
  withNextStep: number;
  team: number;
  own: number;
}

/** Attr keys that flag a project as needing attention on the Projects page. */
const ATTENTION_KEYS = ["security_vulnerability", "broken_features", "deployment_issue"] as const;

function hasAttention(attrs: Record<string, string>): boolean {
  return ATTENTION_KEYS.some((k) => Boolean(attrs[k]));
}

export function computeProjectsPageStats(projects: ProjectGridRow[]): ProjectsPageStats {
  let attention = 0;
  let security = 0;
  let withNextStep = 0;
  let team = 0;

  for (const p of projects) {
    if (p.readonly) team += 1;
    if (p.attrs["security_vulnerability"]) security += 1;
    if (hasAttention(p.attrs)) attention += 1;
    if (p.attrs["next_step"]?.trim()) withNextStep += 1;
  }

  return {
    total: projects.length,
    attention,
    security,
    healthy: projects.length - attention,
    withNextStep,
    team,
    own: projects.length - team,
  };
}

export function filterProjects(
  projects: ProjectGridRow[],
  query: string,
  statusFilter: string | null,
  pageFilter: ProjectsPageFilter,
): ProjectGridRow[] {
  const q = query.trim().toLowerCase();

  const result = projects.filter((p) => {
    if (statusFilter && p.attrs["status"] !== statusFilter) return false;
    if (pageFilter === "team" && !p.readonly) return false;
    if (pageFilter === "security" && !p.attrs["security_vulnerability"]) return false;
    if (pageFilter === "attention" && !hasAttention(p.attrs)) return false;
    if (pageFilter === "next-step" && !p.attrs["next_step"]?.trim()) return false;
    if (pageFilter === "healthy" && hasAttention(p.attrs)) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q) ||
      Object.values(p.attrs).some((v) => v.toLowerCase().includes(q))
    );
  });

  return result.sort((a, b) => {
    const aHasIssues = hasAttention(a.attrs);
    const bHasIssues = hasAttention(b.attrs);
    if (aHasIssues !== bHasIssues) return aHasIssues ? -1 : 1;
    const aHasNext = Boolean(a.attrs["next_step"]?.trim());
    const bHasNext = Boolean(b.attrs["next_step"]?.trim());
    if (aHasNext !== bHasNext) return aHasNext ? -1 : 1;
    if (a.readonly !== b.readonly) return a.readonly ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export function groupFilteredProjects(projects: ProjectGridRow[]): {
  attention: ProjectGridRow[];
  own: ProjectGridRow[];
  team: ProjectGridRow[];
} {
  const attention: ProjectGridRow[] = [];
  const own: ProjectGridRow[] = [];
  const team: ProjectGridRow[] = [];

  for (const p of projects) {
    if (hasAttention(p.attrs)) {
      attention.push(p);
    } else if (p.readonly) {
      team.push(p);
    } else {
      own.push(p);
    }
  }

  return { attention, own, team };
}
