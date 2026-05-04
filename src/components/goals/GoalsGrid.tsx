"use client";

import { useState } from "react";
import { Search, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GoalCard } from "./GoalCard";
import { CompletedGoals } from "./CompletedGoals";
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

export function GoalsGrid({
  activeGoals,
  completedGoals,
}: {
  activeGoals: GoalWithChildren[];
  completedGoals: GoalWithChildren[];
}) {
  const [query, setQuery] = useState("");

  const q = query.trim();
  const filteredActive = filterTree(activeGoals, q);
  const filteredCompleted = filterTree(completedGoals, q);
  const totalActive = activeGoals.length;
  const matchCount = filteredActive.length;

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
          className="w-full rounded-lg border border-border-subtle bg-surface-base pl-10 pr-14 py-2.5 text-sm md:text-base focus:outline-none focus:border-border-strong placeholder:text-text-muted"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
          {q ? `${matchCount} / ${totalActive}` : totalActive}
        </span>
      </div>

      {/* Active goals */}
      {filteredActive.length > 0 ? (
        <div className="space-y-3">
          {filteredActive.map((goal) => (
            <GoalCard key={goal.id} goal={goal} depth={0} />
          ))}
        </div>
      ) : q && activeGoals.length > 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-6 text-text-muted">
            <Target className="h-8 w-8" />
            <div className="text-sm">No active goals match &ldquo;{q}&rdquo;</div>
          </div>
        </Card>
      ) : activeGoals.length === 0 && completedGoals.length > 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-6 text-text-muted">
            <Target className="h-8 w-8" />
            <div className="text-sm">All goals completed</div>
          </div>
        </Card>
      ) : null}

      <CompletedGoals goals={filteredCompleted} />
    </>
  );
}
