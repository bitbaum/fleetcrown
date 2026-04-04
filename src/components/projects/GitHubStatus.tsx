"use client";

import { useEffect, useState } from "react";
import { GitBranch, CheckCircle, XCircle, Loader2, Clock } from "lucide-react";

type RepoStatus = {
  repo: string;
  open_prs?: number;
  dependabot_prs?: number;
  ci_name?: string;
  ci_status?: string;
  ci_date?: string;
};

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle; className: string }> = {
  success: { icon: CheckCircle, className: "text-green-400" },
  failure: { icon: XCircle, className: "text-red-400" },
  running: { icon: Loader2, className: "text-yellow-400 animate-spin" },
  cancelled: { icon: Clock, className: "text-white/30" },
};

export function GitHubStatus() {
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/github")
      .then((res) => res.json())
      .then((data) => {
        setRepos(Array.isArray(data.repos) ? data.repos : []);
        if (data.error) setError(data.error);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="h-4 w-4 text-white/50" />
        <h2 className="text-sm font-medium text-white/70">CI / GitHub</h2>
      </div>
      {loading ? (
        <div className="text-sm text-white/30 animate-pulse">Checking repos...</div>
      ) : error && repos.length === 0 ? (
        <div className="text-sm text-white/30">{error}</div>
      ) : repos.length === 0 ? (
        <div className="text-sm text-white/30">No repo data</div>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => {
            const status = STATUS_ICONS[repo.ci_status ?? ""] ?? STATUS_ICONS.cancelled;
            const Icon = status.icon;
            return (
              <div key={repo.repo} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${status.className}`} />
                  <span className="text-sm font-medium">{repo.repo}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/40">
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
    </div>
  );
}
