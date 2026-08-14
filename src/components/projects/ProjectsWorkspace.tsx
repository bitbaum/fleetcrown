"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, FolderKanban, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants/timings";
import { PROJECTS_LIST_CHUNK } from "@/lib/projects-display";
import {
  computeProjectsPageStats,
  filterProjects,
  partitionAttentionProjects,
  type ProjectsPageFilter,
} from "@/lib/projects-page-stats";
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
  const searchParams = useSearchParams();

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
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [debouncedQuery, pageFilter, pathname]);

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
    setQuery("");
    setPageFilter(null);
  });

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
            <section className="space-y-2" aria-label="Projects with site or risk flags">
              {attention.length > 1 && (
                <h2 className="ui-projects-section-label">Site / risk flags</h2>
              )}
              <p className="text-xs text-text-tertiary">
                Only projects with a down live URL or an explicit flag (security / broken feature / deploy issue). Not a general priority list.
              </p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {attention.map((project) => (
                  <ProjectGridCard key={project.id} project={project} />
                ))}
              </div>
            </section>
          )}

          {visibleRest.length > 0 && (
            <section aria-label="All projects">
              {showAttentionCards && (
                <h2 className="ui-projects-section-label mb-2">
                  {pageFilter || debouncedQuery ? "Matching projects" : "Fleet"}
                </h2>
              )}
              <div className="ui-projects-list flex flex-col">
                {visibleRest.map((project) => (
                  <ProjectListRow key={project.id} project={project} />
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

    </div>
  );
}
