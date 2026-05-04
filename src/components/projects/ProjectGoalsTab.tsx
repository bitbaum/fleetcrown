"use client";

import { useState } from "react";
import { CheckCircle, Loader2, Plus, Target, X } from "lucide-react";
import { patchGoal, listGoals, createGoal } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import type { LinkedGoal } from "./project-detail-types";
import { ADD_BUTTON_CLASS, FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";

type PanelMode = "idle" | "link" | "create";

export function GoalsTab({ goals: initialGoals, projectId }: { goals: LinkedGoal[]; projectId: string }) {
  const [linked, setLinked] = useState<LinkedGoal[]>(initialGoals);
  const [mode, setMode] = useState<PanelMode>("idle");
  const [allGoals, setAllGoals] = useState<Array<{ id: string; title: string; entityId: string | null }>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openLink = async () => {
    setMode("link");
    setSelectedId("");
    const res = await listGoals();
    const data = await res.json();
    const linkedIds = new Set(linked.map((g) => g.id));
    setAllGoals((data.goals ?? []).filter((g: { id: string }) => !linkedIds.has(g.id)));
  };

  const openCreate = () => {
    setMode("create");
    setNewTitle("");
    setNewDate("");
    setError(null);
  };

  const cancel = () => {
    setMode("idle");
    setError(null);
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
      setMode("idle");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await createGoal({ title, targetDate: newDate || undefined, entityId: projectId });
      const data = await res.json() as { ok?: boolean; goal?: { id: string; title: string; targetDate?: string | null }; error?: string };
      if (!data.ok) { setError(data.error ?? "Failed to create goal"); return; }
      if (data.goal) {
        setLinked((prev) => [...prev, {
          id: data.goal!.id,
          title: data.goal!.title,
          description: null,
          status: GOAL_STATUS.ACTIVE,
          progress: 0,
          targetDate: data.goal!.targetDate ?? null,
          milestones: null,
        }]);
      }
      setMode("idle");
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
          <div key={goal.id} className="rounded-lg border border-border-subtle bg-surface-base p-3 group">
            <div className="flex items-start gap-2.5">
              {isCompleted
                ? <CheckCircle className="h-4 w-4 text-status-positive shrink-0 mt-0.5" />
                : <Target className="h-4 w-4 text-status-positive/50 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-text-primary">{goal.title}</div>
                  <button
                    onClick={() => handleUnlink(goal.id)}
                    className="sm:opacity-0 sm:group-hover:opacity-100 text-text-muted hover:text-status-negative transition-all ml-auto shrink-0"
                    title="Unlink from project"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {goal.description && (
                  <p className="text-[11px] text-text-tertiary mt-0.5">{goal.description}</p>
                )}
                {!isCompleted && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                      <span>{progress}%</span>
                      {milestones.length > 0 && <span>{done}/{milestones.length} milestones</span>}
                    </div>
                    <div className="h-1 bg-surface-raised rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progress >= 80 ? "bg-status-positive" : progress >= 50 ? "bg-status-warning" : "bg-accent-primary"}`}
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
                          ? <CheckCircle className="h-3 w-3 text-status-positive/60 shrink-0" />
                          : <div className="h-3 w-3 rounded-full border border-border-strong shrink-0" />}
                        <span className={m.done ? "text-text-muted line-through" : "text-text-secondary"}>{m.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {linked.length === 0 && mode === "idle" && (
        <p className="text-xs text-text-muted pt-1">No goals linked to this project.</p>
      )}

      {mode === "link" && (
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            autoFocus
            className="flex-1 bg-surface-raised border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-border-strong"
          >
            <option value="">— Select a goal —</option>
            {allGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <button
            onClick={handleLink}
            disabled={!selectedId || saving}
            className="px-2.5 py-1.5 rounded-lg ui-btn-confirm disabled:opacity-30 text-xs font-medium transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
          </button>
          <button onClick={cancel} className="px-2 py-1.5 text-xs text-text-muted hover:text-text-secondary">
            Cancel
          </button>
        </div>
      )}

      {mode === "create" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => { setNewTitle(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") cancel(); }}
              placeholder="Goal title…"
              autoFocus
              className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className={FIELD_INPUT_CLASS_TIGHT}
            />
          </div>
          {error && <p className="text-xs text-status-negative">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || saving}
              className="px-2.5 py-1.5 rounded-lg ui-btn-confirm disabled:opacity-30 text-xs font-medium transition-colors flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create
            </button>
            <button onClick={cancel} className="px-2 py-1.5 text-xs text-text-muted hover:text-text-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-3">
          <button onClick={openCreate} className={ADD_BUTTON_CLASS}>
            <Plus className="h-3.5 w-3.5" /> New goal
          </button>
          <button onClick={openLink} className={ADD_BUTTON_CLASS}>
            <Plus className="h-3.5 w-3.5" /> Link existing
          </button>
        </div>
      )}
    </div>
  );
}
