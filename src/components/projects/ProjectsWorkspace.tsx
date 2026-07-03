"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, FolderKanban, ChevronDown } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { NAV } from "@/config/navigation";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants/timings";
import { PROJECTS_LIST_CHUNK } from "@/lib/projects-display";
import {
  computeProjectsPageStats,
  filterProjects,
  partitionAttentionProjects,
  type ProjectsPageFilter,
} from "@/lib/projects-page-stats";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectGridCard, type ProjectGridRow } from "./ProjectGridCard";
import { ProjectListRow } from "./ProjectListRow";
import { ProjectsSummary } from "./ProjectsSummary";
import { ProjectsCiPanel } from "./ProjectsCiPanel";

const FILTER_PARAMS = new Set<ProjectsPageFilter>(["attention", "next-step", "team"]);

function parseFilter(raw: string | null): ProjectsPageFilter {
  if (raw && FILTER_PARAMS.has(raw as ProjectsPageFilter)) return raw as ProjectsPageFilter;
  return null;
}

export function ProjectsWorkspace({ projects }: { projects: ProjectGridRow[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("open"));
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [pageFilter, setPageFilter] = useState<ProjectsPageFilter>(() => parseFilter(searchParams.get("filter")));
  const [listExpanded, setListExpanded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (pageFilter) params.set("filter", pageFilter);
    if (selectedId) params.set("open", selectedId);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [debouncedQuery, pageFilter, selectedId, pathname]);

  const stats = useMemo(() => computeProjectsPageStats(projects), [projects]);

  const filtered = useMemo(
    () => filterProjects(projects, debouncedQuery, pageFilter),
    [projects, debouncedQuery, pageFilter],
  );

  const { attention, rest } = useMemo(() => partitionAttentionProjects(filtered), [filtered]);
  const showAttentionCards = attention.length > 0;
  const listOverflow = rest.length > PROJECTS_LIST_CHUNK;
  const visibleRest = listExpanded ? rest : rest.slice(0, PROJECTS_LIST_CHUNK);

  useEscapeKey(() => {
    if (!selectedId) {
      setQuery("");
      setPageFilter(null);
    }
  });

  // Card click → the FULL project page (/projects/[id], the dossier). The
  // right-side drawer remains the quick-edit surface, reachable via the
  // page's "Quick edit" button and existing ?open= deep links.
  const openProject = (id: string) => router.push(`/projects/${id}`);
  const closeProject = () => {
    setSelectedId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("open");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="space-y-5">
      <div className="ui-projects-sticky-bar space-y-3">
        <div className="relative min-w-0">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search projects…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setListExpanded(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="ui-search-input"
            aria-label="Search projects"
          />
        </div>

        <ProjectsSummary
          stats={stats}
          activeFilter={pageFilter}
          onFilter={(next) => {
            setPageFilter(next);
            setListExpanded(false);
          }}
          resultCount={filtered.length}
          totalCount={projects.length}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects match">
          {debouncedQuery
            ? `Nothing matched “${debouncedQuery}”. Try a shorter term or clear filters.`
            : "Clear filters to see your full fleet."}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {showAttentionCards && (
            <section className="space-y-2" aria-label="Projects needing attention">
              {attention.length > 1 && (
                <h2 className="ui-projects-section-label">Needs attention</h2>
              )}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {attention.map((project) => (
                  <ProjectGridCard key={project.id} project={project} onOpen={() => openProject(project.id)} />
                ))}
              </div>
            </section>
          )}

          {visibleRest.length > 0 && (
            <section aria-label="All projects">
              {showAttentionCards && (
                <h2 className="ui-projects-section-label mb-2">
                  {pageFilter || debouncedQuery ? "Matching projects" : "All others"}
                </h2>
              )}
              <div className="ui-projects-list flex flex-col">
                {visibleRest.map((project) => (
                  <ProjectListRow key={project.id} project={project} onOpen={() => openProject(project.id)} />
                ))}
              </div>
              {listOverflow && !listExpanded && (
                <button
                  type="button"
                  onClick={() => setListExpanded(true)}
                  className="ui-projects-show-more"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  Show all {rest.length} projects
                </button>
              )}
            </section>
          )}
        </div>
      )}

      <ProjectsCiPanel projects={projects} />

      {projects.length > 0 && filtered.length > 0 && (
        <p className="text-center text-xs text-text-muted">
          Open a row for the full profile ·{" "}
          <Link href={NAV.control.href} className="text-accent-text underline-offset-2 hover:underline">
            Control
          </Link>{" "}
          to dispatch agents
        </p>
      )}

      {selectedId && <ProjectDetail projectId={selectedId} onClose={closeProject} />}
    </div>
  );
}
