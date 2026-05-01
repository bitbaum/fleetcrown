"use client";

import { useState, useMemo } from "react";
import { GitBranch, Globe, ShieldAlert, AlertTriangle, Zap, Search } from "lucide-react";
import { ProjectDetail } from "./ProjectDetail";
import {
  MaturityBar,
  StatusBadge,
  HealthBadge,
  getHealthSignals,
} from "./project-badges";
import { getProjectLinks, RESERVED } from "./project-detail-types";

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
  const { prodUrl, repo } = getProjectLinks(attrs);
  const maturity = attrs["maturity"];
  const status = attrs["status"];
  const signals = getHealthSignals(attrs);
  const hasIssues = signals.length > 0;

  return (
    <div
      onClick={onOpen}
      className={`group relative flex cursor-pointer flex-col gap-3 rounded-[1.5rem] border p-4 transition-all hover:bg-surface-raised ${
        hasIssues ? "border-yellow-500/20 bg-yellow-500/[0.04]" : "border-border-subtle bg-surface-base"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-text-primary">{project.name}</div>
          {description && (
            <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-text-secondary">
              {description}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {prodUrl && (
            <a
              href={prodUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-primary"
              title="Open production site"
            >
              <Globe className="h-3.5 w-3.5" />
            </a>
          )}
          {repo && (
            <a
              href={repo}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-primary"
              title="Open repo"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {(status || maturity) && (
        <div className="flex flex-col gap-1.5">
          {status && <StatusBadge value={status} />}
          {maturity && <MaturityBar value={maturity} />}
        </div>
      )}

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s) => (
            <HealthBadge key={s.kind} signal={s} />
          ))}
        </div>
      )}

      {!status && !maturity && !hasIssues && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(attrs)
            .filter(([k]) => !RESERVED.includes(k))
            .slice(0, 2)
            .map(([key, value]) => (
              <span key={key} className="rounded-full border border-border-default bg-surface-overlay px-2 py-0.5 text-[10px] text-text-tertiary">
                {String(value).slice(0, 30)}
              </span>
            ))}
        </div>
      )}

      <div className="absolute bottom-3 right-3 opacity-0 transition-opacity group-hover:opacity-100">
        <Zap className="h-3 w-3 text-text-muted" />
      </div>
    </div>
  );
}

export function ProjectGrid({ projects }: { projects: Project[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return projects;
    const q = query.toLowerCase();
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q) ||
      Object.values(p.attrs).some((v) => v.toLowerCase().includes(q)),
    );
  }, [projects, query]);

  const withIssues = projects.filter((p) => getHealthSignals(p.attrs).length > 0);
  const securityRisks = projects.filter((p) =>
    p.attrs["security_vulnerability"],
  ).length;

  return (
    <>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
        <input
          type="text"
          placeholder="Search projects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-2xl border border-border-default bg-surface-overlay py-3 pl-11 pr-16 text-base text-text-primary outline-none transition-colors focus:border-accent-primary placeholder:text-text-muted"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border-subtle bg-surface-base px-2 py-0.5 text-xs font-medium text-text-secondary">
          {filtered.length}
        </span>
      </div>

      {withIssues.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-xs">
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
          <span className="ml-auto text-text-tertiary">
            {projects.length - withIssues.length}/{projects.length} healthy
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filtered.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onOpen={() => setSelectedId(project.id)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 py-4 text-center text-sm text-text-tertiary">No projects match &ldquo;{query}&rdquo;</p>
        )}
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
