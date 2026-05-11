"use client";

import { useState } from "react";
import { Check, Loader2, X, Flame, Pencil } from "lucide-react";
import type { HabitWithStatus } from "@/db/queries/habits";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";
import { useInlineEdit } from "@/hooks/use-inline-edit";

type EditDraft = { title: string; frequency: HabitFrequency };

export function HabitRow({
  habit,
  onToggle,
  onEdit,
  onRemove,
}: {
  habit: HabitWithStatus;
  /** Returns once the optimistic state has been committed/rolled back. */
  onToggle: (id: string, currentDone: boolean) => Promise<void>;
  /** Returns true if save succeeded; row exits edit mode either way. */
  onEdit: (id: string, patch: EditDraft) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
}) {
  const ie = useInlineEdit<EditDraft>({ title: "", frequency: HABIT_FREQUENCY.DAILY });
  const [toggling, setToggling] = useState(false);

  const startEdit = () => ie.start({
    title: habit.title,
    frequency: habit.frequency,
  });

  const commitEdit = () => {
    if (!ie.draft.title.trim()) return;
    ie.commit(async () => {
      await onEdit(habit.id, {
        title: ie.draft.title.trim(),
        frequency: ie.draft.frequency,
      });
    });
  };

  const handleToggle = async () => {
    if (toggling || ie.editing) return;
    setToggling(true);
    try { await onToggle(habit.id, habit.doneToday); } finally { setToggling(false); }
  };

  if (ie.editing) {
    return (
      <div className="flex gap-2 items-center">
        <div className="h-4 w-4 shrink-0" />
        <input
          value={ie.draft.title}
          onChange={(e) => ie.setDraft({ ...ie.draft, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") ie.cancel();
          }}
          autoFocus
          className="ui-input-inline flex-1 px-2 py-0.5 text-sm text-text-primary"
        />
        <select
          value={ie.draft.frequency}
          onChange={(e) => ie.setDraft({ ...ie.draft, frequency: e.target.value as HabitFrequency })}
          className="ui-input-inline border-border-subtle px-1.5 py-0.5 text-xs text-text-secondary"
        >
          {Object.values(HABIT_FREQUENCY).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button
          onClick={commitEdit}
          disabled={!ie.draft.title.trim() || ie.saving}
          className="ui-btn-confirm-icon shrink-0"
        >
          {ie.saving ? <Loader2 className="ui-spinner-xs" /> : <Check className="h-3 w-3" />}
        </button>
        <button onClick={ie.cancel} className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors shrink-0">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3">
      <button
        onClick={handleToggle}
        disabled={toggling}
        className="shrink-0 p-1 flex items-center justify-center disabled:opacity-50 rounded"
        title={habit.doneToday ? "Mark undone" : "Mark done"}
      >
        {toggling ? (
          <Loader2 className="ui-spinner text-text-muted" />
        ) : habit.doneToday ? (
          <div className="h-4 w-4 rounded-full bg-status-positive/50 flex items-center justify-center">
            <Check className="h-2.5 w-2.5 text-text-inverted" />
          </div>
        ) : (
          <div className="h-4 w-4 rounded-full border border-border-strong hover:border-status-positive/60 transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <span className={`text-sm md:text-base ${habit.doneToday ? "text-text-tertiary line-through" : ""}`}>
          {habit.title}
        </span>
        {habit.frequency !== HABIT_FREQUENCY.DAILY && (
          <span className="ml-1.5 text-xs text-text-tertiary">{habit.frequency}</span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {habit.streak >= 2 && (
          <span className="flex items-center gap-0.5 text-xs text-status-warning/60" title={`${habit.streak}-day streak`}>
            <Flame className="h-3 w-3" />
            {habit.streak}
          </span>
        )}
        <button
          onClick={startEdit}
          className="ui-btn-row-action opacity-0 group-hover:opacity-100"
          title="Edit habit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => onRemove(habit.id)}
          className="p-1.5 rounded text-text-muted hover:text-status-negative/60 hover:bg-status-negative/5 transition-colors opacity-0 group-hover:opacity-100"
          title="Remove habit"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
