"use client";

import { useState } from "react";
import { ExternalLink, GitBranch, Globe, ShieldAlert, AlertTriangle, Zap } from "lucide-react";
import { ProjectDetail } from "./ProjectDetail";
import {
  MaturityBar,
  StatusBadge,
  HealthBadge,
  getHealthSignals,
} from "./project-badges";

type Project = {
  id: string;
  name: string;
  description: string | null;
  attrs: Record<string, string>;
};

function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: () => void;
}) {
  const { attrs } = project;
  const description = project.description ?? attrs["description"] ?? null;
  const prodUrl = attrs["production_url"] ?? attrs["url"];
  const repo = attrs["repo"] ?? attrs["github_repo"];
  const maturity = attrs["maturity"];
  const status = attrs["status"];
  const signals = getHealthSignals(attrs);
  const hasIssues = signals.length > 0;

  return (
    <div
      onClick={onOpen}
      className={`relative flex flex-col gap-3 rounded-xl border p-4 cursor-pointer transition-all hover:border-white/15 hover:bg-white/[0.04] ${
        hasIssues ? "border-yellow-500/20 bg-yellow-500/[0.02]" : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{project.name}</div>
          {description && (
            <div className="text-xs text-white/40 mt-0.5 line-clamp-2 leading-relaxed">
              {description}
            </div>
          )}
        </div>

        {/* External links */}
        <div className="flex items-center gap-1 shrink-0">
          {prodUrl && (
            <a
              href={prodUrl.startsWith("http") ? prodUrl : `https://${prodUrl}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded text-white/25 hover:text-white/60 transition-colors"
              title="Open production site"
            >
              <Globe className="h-3.5 w-3.5" />
            </a>
          )}
          {repo && (
            <a
              href={repo.startsWith("http") ? repo : `https://github.com/${repo}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded text-white/25 hover:text-white/60 transition-colors"
              title="Open repo"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Status + Maturity */}
      {(status || maturity) && (
        <div className="flex flex-col gap-1.5">
          {status && <StatusBadge value={status} />}
          {maturity && <MaturityBar value={maturity} />}
        </div>
      )}

      {/* Health signals */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s) => (
            <HealthBadge key={s.kind} signal={s} />
          ))}
        </div>
      )}

      {/* Footer: attr preview for projects without status/maturity */}
      {!status && !maturity && !hasIssues && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(attrs)
            .filter(([k]) => !["production_url", "url", "repo", "github_repo", "owner", "description"].includes(k))
            .slice(0, 2)
            .map(([key, value]) => (
              <span key={key} className="px-2 py-0.5 rounded-full text-[10px] bg-white/[0.04] text-white/35 border border-white/[0.07]">
                {String(value).slice(0, 30)}
              </span>
            ))}
        </div>
      )}

      {/* "Click to explore" hint — bottom right */}
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <Zap className="h-3 w-3 text-white/20" />
      </div>
    </div>
  );
}

export function ProjectGrid({ projects }: { projects: Project[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Compute health summary
  const withIssues = projects.filter((p) => getHealthSignals(p.attrs).length > 0);
  const securityRisks = projects.filter((p) =>
    p.attrs["security_vulnerability"],
  ).length;

  return (
    <>
      {/* Health summary bar */}
      {withIssues.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1 pb-1 text-xs">
          {securityRisks > 0 && (
            <span className="flex items-center gap-1.5 text-red-400">
              <ShieldAlert className="h-3.5 w-3.5" />
              {securityRisks} security risk{securityRisks > 1 ? "s" : ""}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-yellow-400/80">
            <AlertTriangle className="h-3.5 w-3.5" />
            {withIssues.length} project{withIssues.length > 1 ? "s" : ""} need attention
          </span>
          <span className="text-white/20 ml-auto">
            {projects.length - withIssues.length}/{projects.length} healthy
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onOpen={() => setSelectedId(project.id)}
          />
        ))}
      </div>

      {selectedId && (
        <ProjectDetail
          projectId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
