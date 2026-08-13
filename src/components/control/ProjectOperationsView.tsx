"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactRelativeDate } from "@/lib/dates";
import { postJson } from "@/lib/api/fetch";
import { FLEETCROWN_REFRESH_EVENT } from "@/lib/client-events";
import type { ProjectState } from "@/lib/control-types";
import type { ProjectOperationsSnapshot } from "./control-presenter";
import { STATE_DEFINITIONS } from "@/lib/control-states";
import type { AutoInjectMode } from "@/config/beacon";
import { ProjectCard } from "./ProjectCard";
import { ProjectAutopilotToggle } from "./ProjectAutopilotToggle";

type CardBaseProps = Omit<Parameters<typeof ProjectCard>[0], "snapshot" | "isOnlyReady">;
type ProjectRailSort = "priority" | "recent" | "az";

function snapshotActivityMs(snapshot: ProjectOperationsSnapshot): number {
  const project = snapshot.project;
  return Math.max(
    snapshot.evidenceAt ?? 0,
    project.session?.mtime ?? 0,
    project.latestOrchestrationRun?.finishedAt ? Date.parse(project.latestOrchestrationRun.finishedAt) : 0,
    project.latestOrchestrationRun?.startedAt ? Date.parse(project.latestOrchestrationRun.startedAt) : 0,
    project.recentActivity[0]?.at ? Date.parse(project.recentActivity[0].at) : 0,
  );
}

export function ProjectOperationsView({
  snapshots,
  selectedTab,
  onSelect,
  cardProps,
  automationMode,
  onBulkNotice,
}: {
  snapshots: ProjectOperationsSnapshot[] | null;
  selectedTab: string | null;
  onSelect: (tab: string) => void;
  cardProps: (project: ProjectState) => CardBaseProps;
  automationMode: AutoInjectMode;
  /** Toast after bulk build/pause on the selected rail rows. */
  onBulkNotice?: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectRailSort>("priority");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const sourceSnapshots = useMemo(() => snapshots ?? [], [snapshots]);

  // Counter categories are sourced from STATE_DEFINITIONS via the SSOT, so
  // the badge on the row and the count in the chip can never disagree:
  // "X working" counts ProjectStateKeys whose counterCategory === "working",
  // "Y awaiting input" counts category === "waiting" (covers ready,
  // orchestration_ready, AND open_idle — all three states where the user's
  // next action is "type a prompt"), "Z open" counts category === "idle".
  const isWaiting = (snapshot: ProjectOperationsSnapshot) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "waiting";
  const isWorking = (snapshot: ProjectOperationsSnapshot) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "working";
  const isIdle = (snapshot: ProjectOperationsSnapshot) =>
    STATE_DEFINITIONS[snapshot.phase].counterCategory === "idle";
  const readyCount = sourceSnapshots.filter(isWaiting).length;
  const workingCount = sourceSnapshots.filter(isWorking).length;
  const openIdleCount = sourceSnapshots.filter(isIdle).length;
  const normalizedQuery = query.trim().toLowerCase();
  // Row positions FREEZE while the user is aiming: live state refreshes update
  // card content but must not reshuffle rows mid-click (priority re-ranking
  // moved the target under the cursor twice on 2026-07-03 — one dispatch went
  // to the wrong project, one vanished). The ranking recomputes only when the
  // sort mode, the query, or the SET of visible projects changes.
  const frozenOrderRef = useRef<{ key: string; order: string[] }>({ key: "", order: [] });
  const visibleSnapshots = useMemo(() => {
    const filtered = normalizedQuery
      ? sourceSnapshots.filter((snapshot) => {
          const haystack = [
            snapshot.project.tab,
            snapshot.project.profile?.mission,
            snapshot.project.profile?.description,
            snapshot.project.dir,
            snapshot.project.git?.branch,
            snapshot.contextSummary,
          ].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : sourceSnapshots;

    const ranked = [...filtered].sort((a, b) => {
      if (sort === "az") return a.project.tab.localeCompare(b.project.tab);
      if (sort === "recent") return snapshotActivityMs(b) - snapshotActivityMs(a) || a.project.tab.localeCompare(b.project.tab);
      return sourceSnapshots.indexOf(a) - sourceSnapshots.indexOf(b);
    });

    const setKey = `${sort}|${normalizedQuery}|${filtered.map((s) => s.project.tab).sort().join(",")}`;
    if (frozenOrderRef.current.key !== setKey) {
      frozenOrderRef.current = { key: setKey, order: ranked.map((s) => s.project.tab) };
    }
    const order = frozenOrderRef.current.order;
    return [...filtered].sort((a, b) => order.indexOf(a.project.tab) - order.indexOf(b.project.tab));
  }, [normalizedQuery, sourceSnapshots, sort]);
  const selected =
    sourceSnapshots.find((snapshot) => snapshot.project.tab === selectedTab) ??
    visibleSnapshots[0] ??
    sourceSnapshots[0];

  const bulkKeys = useMemo(() => Array.from(bulkSelected), [bulkSelected]);

  const toggleBulk = (tab: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });
  };

  const runBulkBuild = async () => {
    if (bulkKeys.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await postJson("/api/control/fleet-kick", {
        projectKeys: bulkKeys,
        source: "control_selected",
      });
      if (res.ok) {
        const body = (await res.json()) as { message?: string };
        onBulkNotice?.((body.message ?? "Build started.").replace(/\*\*/g, ""));
        window.dispatchEvent(new CustomEvent(FLEETCROWN_REFRESH_EVENT));
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkPause = async () => {
    if (bulkKeys.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await postJson("/api/control/fleet-pause", { projectKeys: bulkKeys });
      if (res.ok) {
        const body = (await res.json()) as { message?: string };
        onBulkNotice?.((body.message ?? "Paused.").replace(/\*\*/g, ""));
        window.dispatchEvent(new CustomEvent(FLEETCROWN_REFRESH_EVENT));
      }
    } finally {
      setBulkBusy(false);
    }
  };

  if (!snapshots) {
    return <div className="ui-card-shell h-72 animate-pulse" />;
  }

  if (sourceSnapshots.length === 0) {
    // Empty state moved one level up to ControlPanel → EmptyStateWelcome
    // (2026-06-05 audit: this view was rendering a second, less-discoverable
    // empty state below the welcome card). Returning null here lets the
    // welcome card breathe alone; callers that don't render the welcome
    // (none today) would need to handle their own zero-state.
    return null;
  }

  return (
    <section className="ui-control-workspace">
      <aside className="ui-control-project-rail">
        <div className="border-b border-border-subtle px-4 pb-3 pt-4">
          <h2 className="text-sm font-semibold text-text-primary">Projects</h2>
          {/* Vocabulary matches the row badges and the fleet chips: "awaiting
              input" is the waiting bucket's label, and the idle bucket is
              called idle — calling it "open" collided with the fleet chip's
              "N tabs open" (a different denominator) on the same screen. */}
          {/* Hidden on mobile: identical to the fleet-status chips stacked
              directly above on a phone (working · awaiting input · idle). The
              desktop two-column layout separates the rail from those chips
              enough to keep the at-a-glance count here. */}
          <p className="mt-1 text-xs text-text-tertiary max-md:hidden">
            {workingCount} working · {readyCount} awaiting input · {openIdleCount} idle
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find project"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {([
              ["priority", "Priority"],
              ["recent", "Recent"],
              ["az", "A-Z"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={cn(
                  "rounded-md px-2 py-1 text-micro transition-colors",
                  sort === id
                    ? "bg-accent-muted text-accent-text"
                    : "text-text-muted hover:bg-surface-overlay hover:text-text-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {bulkKeys.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="ui-micro-label text-text-muted">{bulkKeys.length} selected</span>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulkBuild()}
                className="ui-btn-primary px-2.5 py-1 text-xs"
              >
                Build selected
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulkPause()}
                className="ui-btn-secondary px-2.5 py-1 text-xs"
              >
                Pause selected
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkSelected(new Set())}
                className="ui-btn-ghost px-2 py-1 text-xs"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="ui-control-project-list">
          {visibleSnapshots.length === 0 && (
            <p className="px-3 py-4 text-sm text-text-muted">No projects match “{query.trim()}”.</p>
          )}
          {visibleSnapshots.map((snapshot) => {
            const active = snapshot.project.tab === selected.project.tab;
            const stateDef = STATE_DEFINITIONS[snapshot.phase];
            const dotClass = stateDef.dotClass;
            const duplicateEvidence = snapshot.evidenceLabel === snapshot.display.stateLabel;
            const evidence = duplicateEvidence
              ? snapshot.evidenceAt
                ? compactRelativeDate(new Date(snapshot.evidenceAt))
                : null
              : snapshot.evidenceAt
                ? `${snapshot.evidenceLabel} ${compactRelativeDate(new Date(snapshot.evidenceAt))}`
                : snapshot.evidenceLabel;
            // Row-level tooltip combines the SSOT description with the
            // problem hint when one exists — same content the inline
            // action chip on the main badge shows, kept consistent here.
            const rowTitle = stateDef.problem
              ? `${stateDef.description}\n\n${stateDef.problem.hint}`
              : stateDef.description;
            return (
              <div
                key={snapshot.project.tab}
                className={cn(
                  "ui-control-project-row",
                  active && "ui-control-project-row-active",
                  bulkSelected.has(snapshot.project.tab) && "ring-1 ring-accent-primary/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={bulkSelected.has(snapshot.project.tab)}
                  onChange={() => toggleBulk(snapshot.project.tab)}
                  aria-label={`Select ${snapshot.project.tab} for bulk actions`}
                  className="mt-1.5 h-3.5 w-3.5 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => onSelect(snapshot.project.tab)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  title={rowTitle}
                >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotClass)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">{snapshot.project.tab}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <ProjectAutopilotToggle
                        variant="rail"
                        projectId={snapshot.project.projectId}
                        currentOverride={snapshot.project.autoInjectModeOverride}
                        inheritedMode={automationMode}
                      />
                      {snapshot.attentionReason && (
                        <span className="h-1.5 w-1.5 rounded-full bg-status-warning" title={snapshot.attentionReason} />
                      )}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-text-secondary">{snapshot.display.stateLabel}</span>
                  {evidence && <span className="mt-0.5 block truncate text-micro text-text-muted">{evidence}</span>}
                </span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <div className="ui-control-project-detail">
        <ProjectCard
          key={selected.project.tab}
          {...cardProps(selected.project)}
          snapshot={selected}
          isOnlyReady={readyCount === 1 && isWaiting(selected)}
        />
      </div>
    </section>
  );
}
