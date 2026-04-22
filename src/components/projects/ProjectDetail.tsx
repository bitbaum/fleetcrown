"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Link2, Globe, GitBranch, MessageSquare } from "lucide-react";

type ProjectDetailData = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  source: string | null;
  attrs: Record<string, string>;
  relations: Array<{
    type: string;
    strength: number | null;
    targetId: string;
    targetName: string;
    targetType: string;
  }>;
  interactions: Array<{
    channel: string;
    direction: string;
    summary: string | null;
    occurredAt: string;
  }>;
};

const ATTR_LABELS: Record<string, string> = {
  stack: "Stack",
  status: "Status",
  repo: "Repo",
  github_repo: "GitHub",
  production_url: "URL",
  db: "Database",
  hosting: "Hosting",
  domain: "Domain",
  tech: "Tech",
  language: "Language",
  framework: "Framework",
};


export function ProjectDetail({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProjectDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  const prodUrl = data?.attrs["production_url"];
  const repo = data?.attrs["repo"] ?? data?.attrs["github_repo"];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0f1117] border-l border-white/10 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 border-b border-white/10 bg-[#0f1117]">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold truncate">
              {loading ? "Loading…" : (data?.name ?? "Not found")}
            </div>
            {data?.description && (
              <div className="text-xs text-white/40 mt-0.5">{data.description}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {prodUrl && (
              <a
                href={prodUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                title="Open production URL"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-white/30 animate-pulse text-sm">Loading…</div>
        ) : !data ? (
          <div className="p-4 text-white/30 text-sm">Project not found</div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Quick links */}
            {(prodUrl || repo) && (
              <div className="flex gap-2 flex-wrap">
                {prodUrl && (
                  <a
                    href={prodUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white/60 hover:text-white/90 hover:bg-white/[0.08] transition-colors"
                  >
                    <Globe className="h-3 w-3" />
                    {prodUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                )}
                {repo && (
                  <a
                    href={repo.startsWith("http") ? repo : `https://github.com/${repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white/60 hover:text-white/90 hover:bg-white/[0.08] transition-colors"
                  >
                    <GitBranch className="h-3 w-3" />
                    {repo.replace(/^https?:\/\/github\.com\//, "")}
                  </a>
                )}
              </div>
            )}

            {/* Attributes */}
            {Object.keys(data.attrs).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Details</div>
                <div className="space-y-1.5">
                  {Object.entries(data.attrs)
                    .filter(([k]) => k !== "production_url" && k !== "repo" && k !== "github_repo")
                    .map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-xs">
                        <span className="text-white/30 w-20 shrink-0 pt-0.5">
                          {ATTR_LABELS[key] ?? key}
                        </span>
                        {value.startsWith("http") ? (
                          <a
                            href={value}
                            target="_blank"
                            rel="noreferrer"
                            className="text-white/60 hover:text-white/90 underline underline-offset-2 truncate"
                          >
                            {value.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="text-white/60 break-words">{value}</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Relations */}
            {data.relations.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">
                  Related ({data.relations.length})
                </div>
                <div className="space-y-1">
                  {data.relations.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Link2 className="h-3 w-3 text-white/20 shrink-0" />
                      <span className="text-white/50 capitalize">{r.type.replace(/_/g, " ")}</span>
                      <span className="text-white/70">{r.targetName}</span>
                      <span className="text-white/25 text-[10px]">{r.targetType}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent interactions */}
            {data.interactions.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">
                  Recent Activity
                </div>
                <div className="space-y-2">
                  {data.interactions.map((i, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs">
                      <MessageSquare className="h-3.5 w-3.5 text-white/20 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-white/25 mb-0.5">
                          {i.channel} · {i.direction} ·{" "}
                          {new Date(i.occurredAt).toLocaleDateString()}
                        </div>
                        {i.summary && (
                          <div className="text-white/55 leading-relaxed">{i.summary}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Source */}
            {data.source && (
              <div className="text-[10px] text-white/20">Source: {data.source}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
