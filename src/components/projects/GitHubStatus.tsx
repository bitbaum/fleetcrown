"use client";

import { GitBranch, CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useFetch } from "@/hooks/use-fetch";

type RepoStatus = {
  repo: string;
  open_prs?: number;
  dependabot_prs?: number;
  ci_name?: string;
  ci_status?: string;
};

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle; className: string }> = {
  success: { icon: CheckCircle, className: "text-green-400" },
  failure: { icon: XCircle, className: "text-red-400" },
  running: { icon: Loader2, className: "text-yellow-400 animate-spin" },
  cancelled: { icon: Clock, className: "text-white/30" },
};

export function GitHubStatus() {
  const { data, loading, error } = useFetch<{ repos: RepoStatus[]; error?: string }>("/api/github");
  const repos = data?.repos ?? [];

  return (
    <Card>
      <CardHeader icon={GitBranch} title="CI / GitHub" />
      {loading ? (
        <div className="text-sm text-white/30 animate-pulse">Checking repos...</div>
      ) : error || (data?.error && repos.length === 0) ? (
        <div className="text-sm text-white/30">{error ?? data?.error}</div>
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
                  <span className="text-sm md:text-base font-medium">{repo.repo}</span>
                </div>
                <div className="flex items-center gap-3 text-xs md:text-sm text-white/40">
                  {(repo.open_prs ?? 0) > 0 && (
                    <span>{repo.open_prs} PR{repo.open_prs !== 1 ? "s" : ""}</span>
                  )}
                  {(repo.dependabot_prs ?? 0) > 0 && (
                    <span className="text-amber-400/60">{repo.dependabot_prs} deps</span>
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
