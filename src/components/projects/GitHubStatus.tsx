"use client";

import { GitBranch, CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FetchErrorState } from "@/components/ui/fetch-error-state";
import { useFetch } from "@/hooks/use-fetch";

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

export function GitHubStatus() {
  const { data, loading, error, refetch } = useFetch<{ repos: RepoStatus[]; error?: string }>("/api/github", { intervalMs: 2 * 60_000, timeoutMs: 15_000 });
  const repos = data?.repos ?? [];

  return (
    <Card>
      <CardHeader icon={GitBranch} title="CI / GitHub" />
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full bg-border-default shrink-0" />
                <div className="h-3 w-32 rounded bg-border-default" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-12 rounded bg-border-subtle" />
                <div className="h-3 w-16 rounded bg-border-subtle" />
              </div>
            </div>
          ))}
        </div>
      ) : error || (data?.error && repos.length === 0) ? (
        <FetchErrorState message="Couldn't load GitHub status" detail={error ?? data?.error} onRetry={refetch} />
      ) : repos.length === 0 ? (
        <EmptyState>No repo data</EmptyState>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => {
            const status = STATUS_ICONS[repo.ci_status ?? ""] ?? STATUS_ICONS.cancelled;
            const Icon = status.icon;
            return (
              <div key={repo.repo} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${status.className}`} />
                  <span className="text-sm font-medium text-text-primary md:text-base">{repo.repo}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary md:text-sm">
                  {(repo.open_prs ?? 0) > 0 && (
                    <span>{repo.open_prs} PR{repo.open_prs !== 1 ? "s" : ""}</span>
                  )}
                  {(repo.dependabot_prs ?? 0) > 0 && (
                    <span className="text-status-warning/80">{repo.dependabot_prs} deps</span>
                  )}
                  {repo.ci_name && <span>{repo.ci_name}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
