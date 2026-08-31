"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";

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
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setFrequency(HABIT_FREQUENCY.DAILY);
    setError(null);
  };
  const close = () => {
    reset();
    setOpen(false);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const ok = await onCreated({ title: trimmed, frequency });
      if (ok) {
        close();
      } else {
        setError("Failed to save — try again");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  };

  if (open) {
    return (
      <div className="space-y-1 pt-1">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") close();
            }}
            placeholder="Habit name…"
            autoFocus
            className="flex-1 ui-input-tight"
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
            className="ui-input-tight"
          >
            {Object.values(HABIT_FREQUENCY).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            className="ui-btn-confirm-icon shrink-0"
          >
            {saving ? <Loader2 className="ui-spinner-xs" /> : <Check className="h-3 w-3" />}
          </button>
          <button onClick={close} className="ui-btn-inline-cancel">
            <X className="h-3 w-3" />
          </button>
        </div>
        {error && <p className="ui-error-xs">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className={emptyState ? "ui-btn-add-success" : "ui-btn-add-success mt-1"}
    >
      <Plus className="h-3.5 w-3.5" />
      {emptyState ? "Add first habit" : "Add habit"}
    </button>
  );
}
