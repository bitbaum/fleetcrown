"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Loader2, Plus, Target, X } from "lucide-react";
import { patchGoal, listGoals, createGoal } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import type { LinkedGoal } from "./project-detail-types";
import { GoalProgressBar } from "@/components/shared/GoalProgressBar";

type PanelMode = "idle" | "link" | "create";

export function GoalsTab({ goals: initialGoals, projectId, onReload }: {
  goals: LinkedGoal[];
  projectId: string;
  onReload?: () => void;
}) {
  const [linked, setLinked] = useState<LinkedGoal[]>(initialGoals);
  // Sync when parent refetches (e.g. after linking a goal — real progress/status flows in)
  useEffect(() => { setLinked(initialGoals); }, [initialGoals]);
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
    setError(null);
    try {
      const data = await listGoals();
      const linkedIds = new Set(linked.map((g) => g.id));
      setAllGoals((data.goals ?? []).filter((g: { id: string }) => !linkedIds.has(g.id)));
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "";
      if (msg.includes("403") || msg.includes("private_zone_locked")) {
        setError("Private zone locked — unlock to link existing goals.");
        setAllGoals([]);
      } else {
        setError("Failed to load goals.");
      }
    }
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
      setMode("idle");
      onReload?.(); // parent refetches → real progress, status, milestones flow back in
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "";
      if (msg.includes("403") || msg.includes("private")) {
        setError("Unlock private zone first to link goals.");
      } else {
        setError("Failed to link goal.");
      }
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
      if (!res.ok) {
        if (res.status === 403) { setError("Unlock private zone to create goals for projects."); return; }
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to create goal");
        return;
      }
      const data = await res.json() as { ok?: boolean; goal?: { id: string; title: string; targetDate?: string | null }; error?: string };
      if (!data.ok) { setError(data.error ?? "Failed to create goal"); return; }
      setMode("idle");
      onReload?.(); // parent refetches → newly created goal comes back with full data
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (goalId: string) => {
    try {
      await patchGoal(goalId, { entityId: null });
      setLinked((prev) => prev.filter((g) => g.id !== goalId));
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "";
      if (msg.includes("403") || msg.includes("private")) {
        setError("Unlock private zone to unlink goals.");
      }
      // else silent fail or parent will refresh
    }
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
                    className="ui-hover-reveal text-text-muted hover:text-status-negative transition-all ml-auto shrink-0"
                    title="Unlink from project"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {goal.description && (
                  <p className="text-xs text-text-tertiary mt-0.5">{goal.description}</p>
                )}
                {!isCompleted && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-micro text-text-tertiary mb-1">
                      <span>{progress}%</span>
                      {milestones.length > 0 && <span>{done}/{milestones.length} milestones</span>}
                    </div>
                    <GoalProgressBar
                      value={progress}
                      minPercent={1}
                      className="h-1 bg-surface-raised"
                    />
                  </div>
                )}
                {milestones.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
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
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Target className="h-6 w-6 text-text-muted" />
          <p className="text-xs text-text-secondary">No goals linked to this project yet.</p>
          <p className="text-micro text-text-muted">Private goals are hidden while the zone is locked — use the sidebar to unlock.</p>
        </div>
      )}

      {mode === "link" && (
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            autoFocus
            className="flex-1 ui-input-tight"
          >
            <option value="">— Select a goal —</option>
            {allGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <button
            onClick={handleLink}
            disabled={!selectedId || saving}
            className="ui-btn-confirm-sm"
          >
            {saving ? <Loader2 className="ui-spinner-xs" /> : "Link"}
          </button>
          <button onClick={cancel} className="px-2 py-1.5 ui-link-muted">
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
              className="flex-1 ui-input-tight"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="ui-input-tight"
            />
          </div>
          {error && <p className="ui-error-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || saving}
              className="ui-btn-confirm-sm"
            >
              {saving ? <Loader2 className="ui-spinner-xs" /> : <Plus className="h-3 w-3" />}
              Create
            </button>
            <button onClick={cancel} className="px-2 py-1.5 ui-link-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-3">
          <button onClick={openCreate} className="ui-btn-add">
            <Plus className="h-3.5 w-3.5" /> New goal
          </button>
          <button onClick={openLink} className="ui-btn-add">
            <Plus className="h-3.5 w-3.5" /> Link existing
          </button>
        </div>
      )}
    </div>
  );
}
