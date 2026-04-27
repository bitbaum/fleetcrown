"use client";

import { useState } from "react";
import { CheckCircle, Loader2, Plus, Target, X } from "lucide-react";
import { patchGoal, listGoals } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import type { LinkedGoal } from "./project-detail-types";
import { ADD_BUTTON_CLASS } from "@/components/ui/form";

export function GoalsTab({ goals: initialGoals, projectId }: { goals: LinkedGoal[]; projectId: string }) {
  const [linked, setLinked] = useState<LinkedGoal[]>(initialGoals);
  const [linking, setLinking] = useState(false);
  const [allGoals, setAllGoals] = useState<Array<{ id: string; title: string; entityId: string | null }>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);

  const openLink = async () => {
    setLinking(true);
    setSelectedId("");
    const res = await listGoals();
    const data = await res.json();
    const linkedIds = new Set(linked.map((g) => g.id));
    setAllGoals((data.goals ?? []).filter((g: { id: string }) => !linkedIds.has(g.id)));
  };

  const handleLink = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await patchGoal(selectedId, { entityId: projectId });
      const chosen = allGoals.find((g) => g.id === selectedId);
      if (chosen) {
        setLinked((prev) => [...prev, { id: chosen.id, title: chosen.title, description: null, status: GOAL_STATUS.ACTIVE, progress: 0, targetDate: null, milestones: null }]);
      }
      setLinking(false);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (goalId: string) => {
    await patchGoal(goalId, { entityId: null });
    setLinked((prev) => prev.filter((g) => g.id !== goalId));
  };

  return (
    <div className="space-y-3">
      {linked.map((goal) => {
        const progress = goal.progress ?? 0;
        const milestones = goal.milestones ?? [];
        const done = milestones.filter((m) => m.done).length;
        const isCompleted = goal.status === GOAL_STATUS.COMPLETED;
        return (
          <div key={goal.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 group">
            <div className="flex items-start gap-2.5">
              {isCompleted
                ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                : <Target className="h-4 w-4 text-emerald-500/50 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-white/85">{goal.title}</div>
                  <button
                    onClick={() => handleUnlink(goal.id)}
                    className="sm:opacity-0 sm:group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all ml-auto shrink-0"
                    title="Unlink from project"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {goal.description && (
                  <p className="text-[11px] text-white/40 mt-0.5">{goal.description}</p>
                )}
                {!isCompleted && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-white/30 mb-1">
                      <span>{progress}%</span>
                      {milestones.length > 0 && <span>{done}/{milestones.length} milestones</span>}
                    </div>
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progress >= 80 ? "bg-emerald-500" : progress >= 50 ? "bg-yellow-500" : "bg-blue-500"}`}
                        style={{ width: `${Math.max(progress, 1)}%` }}
                      />
                    </div>
                  </div>
                )}
                {milestones.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        {m.done
                          ? <CheckCircle className="h-3 w-3 text-emerald-500/60 shrink-0" />
                          : <div className="h-3 w-3 rounded-full border border-white/20 shrink-0" />}
                        <span className={m.done ? "text-white/25 line-through" : "text-white/55"}>{m.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {linked.length === 0 && !linking && (
        <p className="text-xs text-white/25 pt-1">No goals linked to this project.</p>
      )}

      {linking ? (
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            autoFocus
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/25"
          >
            <option value="">— Select a goal —</option>
            {allGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <button
            onClick={handleLink}
            disabled={!selectedId || saving}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-medium transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
          </button>
          <button onClick={() => setLinking(false)} className="px-2 py-1.5 text-xs text-white/30 hover:text-white/60">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={openLink}
          className={ADD_BUTTON_CLASS}
        >
          <Plus className="h-3.5 w-3.5" /> Link existing goal
        </button>
      )}
    </div>
  );
}
