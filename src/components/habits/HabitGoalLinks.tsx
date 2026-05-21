"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Plus, XCircle, Loader2, X } from "lucide-react";
import { postJson, deleteJson } from "@/lib/api/fetch";
import type { LinkedGoal } from "@/db/queries/habit-goals";

export function HabitGoalLinks({
  habitId,
  linked,
  allGoals,
}: {
  habitId: string;
  linked: LinkedGoal[];
  allGoals: LinkedGoal[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<LinkedGoal[]>(linked);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const flashError = (msg: string) => {
    setLinkError(msg);
    setTimeout(() => setLinkError(null), 3000);
  };

  const unlinked = allGoals.filter((g) => !items.some((l) => l.id === g.id));

  const handleLink = async (goal: LinkedGoal) => {
    setSaving(goal.id);
    setPicking(false);
    try {
      const res = await postJson(`/api/habits/${habitId}/goals`, { goalId: goal.id });
      if (res.ok) {
        setItems((prev) => [...prev, goal]);
        router.refresh();
      } else {
        setPicking(true);
        flashError("Failed to link — try again");
      }
    } catch {
      setPicking(true);
      flashError("Network error — try again");
    } finally {
      setSaving(null);
    }
  };

  const handleUnlink = async (goalId: string) => {
    setSaving(goalId);
    try {
      const res = await deleteJson(`/api/habits/${habitId}/goals`, { goalId });
      if (res.ok) {
        setItems((prev) => prev.filter((g) => g.id !== goalId));
        router.refresh();
      } else {
        flashError("Failed to unlink — try again");
      }
    } catch {
      flashError("Network error — try again");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
      <Target className="h-3 w-3 text-text-muted shrink-0" />
      {linkError && <span className="text-xs text-status-negative">{linkError}</span>}

      {items.length === 0 && !picking && (
        <span className="text-xs text-text-muted">no goal linked</span>
      )}

      {items.map((goal) => (
        <span key={goal.id} className="flex items-center gap-0.5 ui-tag ui-tag-accent group">
          <span>{goal.title}</span>
          <button
            onClick={() => handleUnlink(goal.id)}
            disabled={saving === goal.id}
            className="ui-hover-reveal transition-opacity ml-0.5"
            title="Unlink"
          >
            {saving === goal.id
              ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
              : <XCircle className="h-2.5 w-2.5" />
            }
          </button>
        </span>
      ))}

      {saving && !items.some((g) => g.id === saving) && (
        <Loader2 className="h-3 w-3 animate-spin text-text-muted" />
      )}

      {unlinked.length > 0 && !picking && (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-0.5 text-xs text-text-muted hover:text-accent-text transition-colors"
          title="Link to a goal"
        >
          <Plus className="h-3 w-3" />
          <span>link goal</span>
        </button>
      )}

      {picking && (
        <div className="flex items-center gap-1 flex-wrap">
          {unlinked.map((goal) => (
            <button
              key={goal.id}
              onClick={() => handleLink(goal)}
              className="text-xs px-2 py-0.5 rounded bg-surface-raised hover:bg-accent-muted text-text-secondary hover:text-accent-text border border-border-subtle transition-colors"
            >
              {goal.title}
            </button>
          ))}
          <button
            onClick={() => setPicking(false)}
            className="p-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
