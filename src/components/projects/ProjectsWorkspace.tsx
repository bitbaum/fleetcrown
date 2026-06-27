"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, FolderKanban } from "lucide-react";
import Link from "next/link";
import { ScrollAffordance } from "@/components/ui/scroll-affordance";
import { EmptyState } from "@/components/ui/empty-state";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { NAV } from "@/config/navigation";
import {
  computeProjectsPageStats,
  filterProjects,
  groupFilteredProjects,
  type ProjectsPageFilter,
} from "@/lib/projects-page-stats";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectGridCard, type ProjectGridRow } from "./ProjectGridCard";
import { ProjectsSummary } from "./ProjectsSummary";
import { ProjectsCiPanel } from "./ProjectsCiPanel";

const CHIP_MAX_CHARS = 24;

function shortStatusLabel(s: string, max = CHIP_MAX_CHARS): string {
  const m = s.match(/^(.{3,}?)(?:\s[—–-]\s|[,:(\[])/);
  const head = (m ? m[1] : s).trim();
  if (head.length < 3) {
    return s.length > max ? s.slice(0, max) + "…" : s;
  }
  return head.length > max ? head.slice(0, max) + "…" : head;
}

function ProjectSection({
  title,
  subtitle,
  projects,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  projects: ProjectGridRow[];
  onOpen: (id: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {projects.map((project) => (
          <ProjectGridCard key={project.id} project={project} onOpen={() => onOpen(project.id)} />
        ))}
      </div>
    </section>
  );
}

export function ProjectsWorkspace({ projects }: { projects: ProjectGridRow[] }) {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("open"));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [pageFilter, setPageFilter] = useState<ProjectsPageFilter>(null);

  const stats = useMemo(() => computeProjectsPageStats(projects), [projects]);

  const statuses = useMemo(
    () => [...new Set(projects.map((p) => p.attrs["status"]).filter(Boolean))].sort() as string[],
    [projects],
  );

  const filtered = useMemo(
    () => filterProjects(projects, query, statusFilter, pageFilter),
    [projects, query, statusFilter, pageFilter],
  );

  const grouped = useMemo(() => groupFilteredProjects(filtered), [filtered]);
  const isFiltered = !!query || !!statusFilter || !!pageFilter;
  const showGrouped = !isFiltered && filtered.length > 6;

  useEscapeKey(() => {
    if (!selectedId) {
      setQuery("");
      setStatusFilter(null);
      setPageFilter(null);
    }
  });

  const openProject = (id: string) => setSelectedId(id);
  const closeProject = () => {
    setSelectedId(null);
    window.history.replaceState(null, "", window.location.pathname);
  };

  return (
    <div className="space-y-6">
      <ProjectsSummary
        stats={stats}
        activeFilter={pageFilter}
        onFilter={(next) => {
          setPageFilter(next);
          if (next) setStatusFilter(null);
        }}
      />

      <ProjectsCiPanel projects={projects} />

      <div className="ui-projects-toolbar">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search name, status, description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="ui-search-input"
            aria-label="Search projects"
          />
          <span className="ui-badge absolute right-3 top-1/2 -translate-y-1/2">
            {isFiltered ? `${filtered.length} / ${projects.length}` : projects.length}
          </span>
        </div>
      </div>

      {statuses.length > 1 && (
        <ScrollAffordance childCount={statuses.length} threshold={4}>
          <div className="flex gap-1.5 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === s ? null : s);
                  if (statusFilter !== s) setPageFilter(null);
                }}
                title={s}
                className={`shrink-0 ${statusFilter === s ? "ui-chip-filter-active" : "ui-chip-filter"}`}
              >
                {shortStatusLabel(s)}
              </button>
            ))}
            {statusFilter && (
              <button type="button" onClick={() => setStatusFilter(null)} className="shrink-0 ui-chip-filter">
                Clear status
              </button>
            )}
          </div>
        </ScrollAffordance>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects match">
          {query
            ? `Nothing matched "${query}". Try a shorter term or clear filters.`
            : "Clear your filters to see the full fleet again."}
        </EmptyState>
      ) : showGrouped ? (
        <div className="space-y-8">
          <ProjectSection
            title="Needs attention"
            subtitle="Security, deployment, or broken-feature flags"
            projects={grouped.attention}
            onOpen={openProject}
          />
          <ProjectSection
            title="Your projects"
            subtitle="Repos and products you own in the fleet"
            projects={grouped.own}
            onOpen={openProject}
          />
          <ProjectSection
            title="Team projects"
            subtitle="Shared org profiles — read-only"
            projects={grouped.team}
            onOpen={openProject}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((project) => (
            <ProjectGridCard key={project.id} project={project} onOpen={() => openProject(project.id)} />
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <p className="text-center text-xs text-text-tertiary">
          Tap a card for the full profile ·{" "}
          <Link href={NAV.control.href} className="text-accent-text underline-offset-2 hover:underline">
            Open Control
          </Link>{" "}
          to dispatch agents
        </p>
      )}

      {selectedId && <ProjectDetail projectId={selectedId} onClose={closeProject} />}
    </div>
  );
}
