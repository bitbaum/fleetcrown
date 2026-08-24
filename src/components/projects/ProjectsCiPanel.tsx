"use client";

import { useMemo } from "react";
import { GitBranch, CheckCircle, XCircle, Loader2, Clock, ChevronDown } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { REFRESH_CADENCE } from "@/config/refresh";
import { FetchErrorState } from "@/components/ui/fetch-error-state";
import type { ProjectGridRow } from "./project-grid-row";

type RepoStatus = {
  repo: string;
  open_prs?: number;
  dependabot_prs?: number;
  ci_name?: string;
  ci_status?: string;
};

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle; className: string }> = {
  success: { icon: CheckCircle, className: "text-status-positive" },
  failure: { icon: XCircle, className: "text-status-negative" },
  running: { icon: Loader2, className: "text-status-warning animate-spin" },
  cancelled: { icon: Clock, className: "text-text-tertiary" },
};

function repoSlugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}

export function ProjectsCiPanel({ projects }: { projects: ProjectGridRow[] }) {
  const { data, loading, error, refetch } = useFetch<{ repos: RepoStatus[]; error?: string; runtimeOnly?: boolean }>(
    "/api/github",
    { intervalMs: REFRESH_CADENCE.projectsCi, timeoutMs: 35_000 },
  );
  const repos = useMemo(() => data?.repos ?? [], [data?.repos]);

  const linkedSlugs = useMemo(() => {
    return new Set(
      projects.map((p) => repoSlugFromUrl(p.gitUrl ?? p.attrs["repo"] ?? null)).filter(Boolean) as string[],
    );
  }, [projects]);

  const linkedRepos = useMemo(() => {
    return repos.filter((r) => linkedSlugs.has(r.repo));
  }, [repos, linkedSlugs]);

  const failing = linkedRepos.filter((r) => r.ci_status === "failure").length;
  const summaryLabel = loading
    ? "Loading CI…"
    : error || (data?.error && repos.length === 0)
      ? "CI unavailable"
      : linkedRepos.length === 0
        ? "No linked repos"
        : failing > 0
          ? `${failing} repo${failing > 1 ? "s" : ""} failing CI`
          : `${linkedRepos.length} repo${linkedRepos.length > 1 ? "s" : ""} tracked`;

  // Cloud hosts can't run `gh`, so CI status is unknowable here regardless of how
  // many repos are linked. Hide the whole panel on hosted rather than show a
  // permanent "Local install only" dead-end. (Follow-up: wire /api/github to the
  // GitHub REST API with the box GH_TOKEN so this works on hosted too.)
  if (!loading && data?.runtimeOnly) {
    return null;
  }

  return (
    <details className="ui-projects-ci-panel">
      <summary className="ui-projects-ci-summary">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-text-primary">GitHub CI</span>
          <span className="truncate text-xs text-text-tertiary">{summaryLabel}</span>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted ui-details-chevron" aria-hidden="true" />
      </summary>

      <div className="ui-projects-ci-body">
        {loading ? (
          <div className="space-y-2 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-raised" />
            ))}
          </div>
        ) : error || (data?.error && repos.length === 0) ? (
          <FetchErrorState message="Couldn't load GitHub status" detail={error ?? data?.error} onRetry={refetch} />
        ) : linkedRepos.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            Link a GitHub repo on a project profile to see CI and open PR counts here.
          </p>
        ) : (
          <div className="space-y-1">
            {linkedRepos.map((repo) => {
              const status = STATUS_ICONS[repo.ci_status ?? ""] ?? STATUS_ICONS.cancelled;
              const Icon = status.icon;
              return (
                <div key={repo.repo} className="ui-projects-ci-row">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${status.className}`} aria-hidden="true" />
                    <span className="truncate text-sm font-medium text-text-primary">{repo.repo}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-text-secondary">
                    {(repo.open_prs ?? 0) > 0 && <span>{repo.open_prs} PR{repo.open_prs !== 1 ? "s" : ""}</span>}
                    {(repo.dependabot_prs ?? 0) > 0 && (
                      <span className="text-status-warning">{repo.dependabot_prs} deps</span>
                    )}
                    {repo.ci_name && <span className="hidden sm:inline">{repo.ci_name}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
