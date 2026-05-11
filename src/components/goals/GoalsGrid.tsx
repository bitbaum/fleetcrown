"use client";

import { useState, useMemo } from "react";
import { Search, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GoalCard } from "./GoalCard";
import { CompletedGoals } from "./CompletedGoals";
import { AbandonedGoals } from "./AbandonedGoals";
import type { GoalWithChildren } from "@/db/queries/goals";

/** True if goal title/description matches query, OR any descendant does */
function matchesQuery(goal: GoalWithChildren, q: string): boolean {
  const lower = q.toLowerCase();
  if (goal.title.toLowerCase().includes(lower)) return true;
  if (goal.description?.toLowerCase().includes(lower)) return true;
  return goal.children.some((child) => matchesQuery(child, q));
}

/** Filter tree, keeping parents whose subtree has a match and pruning non-matching children */
function filterTree(goals: GoalWithChildren[], q: string): GoalWithChildren[] {
  if (!q) return goals;
  return goals
    .filter((g) => matchesQuery(g, q))
    .map((g) => ({ ...g, children: filterTree(g.children, q) }));
}

/** Filter tree to goals linked to a specific project (entityName match) */
function filterByProject(goals: GoalWithChildren[], project: string): GoalWithChildren[] {
  return goals.filter((g) => g.entityName === project);
}

export function GoalsGrid({
  activeGoals,
  completedGoals,
  abandonedGoals,
}: {
  activeGoals: GoalWithChildren[];
  completedGoals: GoalWithChildren[];
  abandonedGoals: GoalWithChildren[];
}) {
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  const projects = useMemo(() => {
    const names = activeGoals.map((g) => g.entityName).filter((n): n is string => !!n);
    return [...new Set(names)].sort();
  }, [activeGoals]);

  const q = query.trim();
  const byProject = projectFilter ? filterByProject(activeGoals, projectFilter) : activeGoals;
  const filteredActive = filterTree(byProject, q);
  const filteredCompleted = filterTree(completedGoals, q);
  const totalActive = activeGoals.length;
  const matchCount = filteredActive.length;
  const isFiltered = !!q || !!projectFilter;

  return (
    <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search goals…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ui-input pl-10 pr-14"
        />
        <span className="ui-badge absolute right-3 top-1/2 -translate-y-1/2">
          {isFiltered ? `${matchCount} / ${totalActive}` : totalActive}
        </span>
      </div>

      {/* Project filter chips */}
      {projects.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {projects.map((name) => (
            <button
              key={name}
              onClick={() => setProjectFilter(projectFilter === name ? null : name)}
              className={projectFilter === name ? "ui-chip-filter-active" : "ui-chip-filter"}
            >
              {name}
            </button>
          ))}
          {projectFilter && (
            <button onClick={() => setProjectFilter(null)} className="ui-chip-filter">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Active goals */}
      {filteredActive.length > 0 ? (
        <div className="space-y-3">
          {filteredActive.map((goal) => (
            <GoalCard key={goal.id} goal={goal} depth={0} />
          ))}
        </div>
      ) : isFiltered && activeGoals.length > 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-6">
            <Target className="h-8 w-8 text-text-tertiary" />
            <div className="text-sm text-text-secondary">No active goals match the current filter</div>
          </div>
        </Card>
      ) : activeGoals.length === 0 && completedGoals.length > 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-6">
            <Target className="h-8 w-8 text-text-tertiary" />
            <div className="text-sm text-text-secondary">All goals completed</div>
          </div>
        </Card>
      ) : null}

      <CompletedGoals goals={filteredCompleted} />
      <AbandonedGoals goals={filterTree(abandonedGoals, q)} />
    </>
  );
}
