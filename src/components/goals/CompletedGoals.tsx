"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GoalCard } from "./GoalCard";
import type { GoalWithChildren } from "@/db/queries/goals";

export function CompletedGoals({ goals }: { goals: GoalWithChildren[] }) {
  const [open, setOpen] = useState(false);

  if (goals.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-text-muted uppercase tracking-wider mb-3 hover:text-text-secondary transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Completed · {goals.length}
      </button>
      {open && (
        <div className="space-y-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
