"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert, AlertTriangle, Search, X } from "lucide-react";
import { ScrollAffordance } from "@/components/ui/scroll-affordance";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { ProjectDetail } from "./ProjectDetail";
import { getHealthSignals } from "./project-badges";
import { ProjectGridCard, type ProjectGridRow } from "./ProjectGridCard";

const CHIP_MAX_CHARS = 24;

// Many users store an entire sentence in the status field — e.g.
// "Active — deployed as systemd service" or "150-line Prisma schema, no CI
// yet, pre-launch". As a filter chip label that reads as ugly mid-sentence
// truncation ("Active — deployed as syst…"). Cut at the first natural break
// (em/en-dash with spaces, comma, colon, " - ", open paren/bracket) so the
// chip surfaces the canonical short label and the full text stays available
// via tooltip. Falls back to a hard truncation when the head is too short to
// be meaningful (no break before the limit).
function shortStatusLabel(s: string, max = CHIP_MAX_CHARS): string {
  const m = s.match(/^(.{3,}?)(?:\s[—–-]\s|[,:(\[])/);
  const head = (m ? m[1] : s).trim();
  if (head.length < 3) {
    return s.length > max ? s.slice(0, max) + "…" : s;
  }
  return head.length > max ? head.slice(0, max) + "…" : head;
}

export function ProjectGrid({ projects }: { projects: ProjectGridRow[] }) {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("open"));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  // "security" → only projects with security_vulnerability set
  // "attention" → only projects with any getHealthSignals() output
  // Lets the banner counts at the top of the grid act as one-click filters
  // instead of dead text.
  const [healthFilter, setHealthFilter] = useState<"security" | "attention" | null>(null);

  // Only clear grid state when no drawer is open — the Drawer handles its own Escape.
  useEscapeKey(() => { if (!selectedId) { setQuery(""); setStatusFilter(null); setHealthFilter(null); } });

  const statuses = useMemo(
    () => [...new Set(projects.map((p) => p.attrs["status"]).filter(Boolean))].sort() as string[],
    [projects],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const result = projects.filter((p) => {
      if (statusFilter && p.attrs["status"] !== statusFilter) return false;
      if (healthFilter === "security" && !p.attrs["security_vulnerability"]) return false;
      if (healthFilter === "attention" && getHealthSignals(p.attrs).length === 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        Object.values(p.attrs).some((v) => v.toLowerCase().includes(q))
      );
    });

    // Sort: issues first → own before team → alphabetically
    return result.sort((a, b) => {
      const aHasIssues = getHealthSignals(a.attrs).length > 0;
      const bHasIssues = getHealthSignals(b.attrs).length > 0;
      if (aHasIssues !== bHasIssues) return aHasIssues ? -1 : 1;
      if (a.readonly !== b.readonly) return a.readonly ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [projects, query, statusFilter, healthFilter]);

  const withIssues = projects.filter((p) => getHealthSignals(p.attrs).length > 0);
  const securityRisks = projects.filter((p) => p.attrs["security_vulnerability"]).length;

  const isFiltered = !!query || !!statusFilter || !!healthFilter;

  return (
    <>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
        <input
          type="text"
          placeholder="Search projects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); (e.target as HTMLInputElement).blur(); } }}
          className="ui-search-input"
        />
        <span className="ui-badge absolute right-3 top-1/2 -translate-y-1/2">
          {isFiltered ? `${filtered.length} / ${projects.length}` : projects.length}
        </span>
      </div>

      {statuses.length > 1 && (
        <ScrollAffordance childCount={statuses.length} threshold={4}>
          <div className="flex gap-1.5 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                title={s}
                className={`shrink-0 ${statusFilter === s ? "ui-chip-filter-active" : "ui-chip-filter"}`}
              >
                {shortStatusLabel(s)}
              </button>
            ))}
            {statusFilter && (
              <button onClick={() => setStatusFilter(null)} className="shrink-0 ui-chip-filter">
                Clear
              </button>
            )}
          </div>
        </ScrollAffordance>
      )}

      {withIssues.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-xs">
          {securityRisks > 0 && (
            <button
              type="button"
              onClick={() => setHealthFilter(healthFilter === "security" ? null : "security")}
              aria-pressed={healthFilter === "security"}
              title={healthFilter === "security" ? "Clear security filter" : `Show only the ${securityRisks} project${securityRisks > 1 ? "s" : ""} with security risks`}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 -mx-2 -my-1 text-status-negative transition-colors hover:bg-status-negative-subtle/50 ${healthFilter === "security" ? "bg-status-negative-subtle ring-2 ring-status-negative/70 font-semibold" : ""}`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {securityRisks} security risk{securityRisks > 1 ? "s" : ""}
              {healthFilter === "security" && <X className="h-3 w-3" aria-hidden />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "attention" ? null : "attention")}
            aria-pressed={healthFilter === "attention"}
            title={healthFilter === "attention" ? "Clear attention filter" : `Show only the ${withIssues.length} project${withIssues.length > 1 ? "s" : ""} needing attention`}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 -mx-2 -my-1 text-status-warning/80 transition-colors hover:bg-status-warning-subtle/50 ${healthFilter === "attention" ? "bg-status-warning-subtle ring-2 ring-status-warning/70 font-semibold text-status-warning" : ""}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {withIssues.length} project{withIssues.length > 1 ? "s" : ""} need{withIssues.length === 1 ? "s" : ""} attention
            {healthFilter === "attention" && <X className="h-3 w-3" aria-hidden />}
          </button>
          <span className="ml-auto text-text-tertiary">
            {projects.length - withIssues.length}/{projects.length} healthy
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => (
          <ProjectGridCard
            key={project.id}
            project={project}
            onOpen={() => setSelectedId(project.id)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 py-4 text-center text-sm text-text-tertiary">
            No projects match{query ? ` "${query}"` : ""}{statusFilter ? ` with status "${statusFilter}"` : ""}
          </p>
        )}
      </div>

      {selectedId && (
        <ProjectDetail
          projectId={selectedId}
          onClose={() => {
            setSelectedId(null);
            window.history.replaceState(null, "", window.location.pathname);
          }}
        />
      )}
    </>
  );
}
