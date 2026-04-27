"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";

export function AddHabitForm({
  onCreated,
  initiallyOpen = false,
  emptyState = false,
}: {
  /** Returns true if the API created the habit (form clears + closes). */
  onCreated: (input: { title: string; frequency: HabitFrequency }) => Promise<boolean>;
  initiallyOpen?: boolean;
  /** When true, render the empty-state CTA instead of the small "Add habit" link. */
  emptyState?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>(HABIT_FREQUENCY.DAILY);
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setFrequency(HABIT_FREQUENCY.DAILY); };
  const close = () => { reset(); setOpen(false); };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const ok = await onCreated({ title: trimmed, frequency });
      if (ok) close();
    } finally {
      setSaving(false);
    }
  };

  if (open) {
    return (
      <div className="flex gap-2 pt-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") close();
          }}
          placeholder="Habit name…"
          autoFocus
          className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
        />
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
          className={FIELD_INPUT_CLASS_TIGHT}
        >
          {Object.values(HABIT_FREQUENCY).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!title.trim() || saving}
          className="p-1.5 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 text-white transition-colors shrink-0"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
        <button onClick={close} className="p-1.5 rounded text-white/25 hover:text-white/60 transition-colors shrink-0">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className={
        emptyState
          ? "flex items-center gap-1.5 text-xs text-white/25 hover:text-emerald-400 transition-colors"
          : "flex items-center gap-1.5 text-xs text-white/35 hover:text-emerald-400 transition-colors mt-1"
      }
    >
      <Plus className="h-3.5 w-3.5" />
      {emptyState ? "Add first habit" : "Add habit"}
    </button>
  );
}
