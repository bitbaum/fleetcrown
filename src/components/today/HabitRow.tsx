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
          className="flex-1 bg-white/[0.04] border border-white/15 rounded px-2 py-0.5 text-sm text-white/85 focus:outline-none focus:border-white/30"
        />
        <select
          value={ie.draft.frequency}
          onChange={(e) => ie.setDraft({ ...ie.draft, frequency: e.target.value as HabitFrequency })}
          className="bg-white/[0.04] border border-white/10 rounded px-1.5 py-0.5 text-xs text-white/70 focus:outline-none focus:border-white/25"
        >
          {Object.values(HABIT_FREQUENCY).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button
          onClick={commitEdit}
          disabled={!ie.draft.title.trim() || ie.saving}
          className="p-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 text-white transition-colors shrink-0"
        >
          {ie.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
        <button onClick={ie.cancel} className="p-1 rounded text-white/25 hover:text-white/60 transition-colors shrink-0">
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
          <Loader2 className="h-4 w-4 animate-spin text-white/30" />
        ) : habit.doneToday ? (
          <div className="h-4 w-4 rounded-full bg-emerald-500/80 flex items-center justify-center">
            <Check className="h-2.5 w-2.5 text-white" />
          </div>
        ) : (
          <div className="h-4 w-4 rounded-full border border-white/25 hover:border-emerald-400/60 transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <span className={`text-sm md:text-base ${habit.doneToday ? "text-white/35 line-through" : ""}`}>
          {habit.title}
        </span>
        {habit.frequency !== HABIT_FREQUENCY.DAILY && (
          <span className="ml-1.5 text-xs text-white/25">{habit.frequency}</span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {habit.streak >= 2 && (
          <span className="flex items-center gap-0.5 text-xs text-amber-400/60" title={`${habit.streak}-day streak`}>
            <Flame className="h-3 w-3" />
            {habit.streak}
          </span>
        )}
        <button
          onClick={startEdit}
          className="p-1.5 rounded text-white/10 hover:text-white/50 hover:bg-white/[0.06] transition-colors opacity-0 group-hover:opacity-100"
          title="Edit habit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => onRemove(habit.id)}
          className="p-1.5 rounded text-white/10 hover:text-red-400/60 hover:bg-red-400/5 transition-colors opacity-0 group-hover:opacity-100"
          title="Remove habit"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
