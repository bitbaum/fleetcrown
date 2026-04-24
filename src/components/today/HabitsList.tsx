"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, X, Flame } from "lucide-react";
import type { HabitWithStatus } from "@/db/queries/habits";
import { HABIT_FREQUENCY } from "@/lib/constants/statuses";

const FREQ_LABELS: Record<string, string> = {
  [HABIT_FREQUENCY.DAILY]:    "daily",
  [HABIT_FREQUENCY.WEEKDAYS]: "weekdays",
  [HABIT_FREQUENCY.WEEKLY]:   "weekly",
};

export function HabitsList({ initialHabits }: { initialHabits: HabitWithStatus[] }) {
  const router = useRouter();
  const [habits, setHabits] = useState(initialHabits);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFreq, setNewFreq] = useState(HABIT_FREQUENCY.DAILY);
  const [saving, setSaving] = useState(false);

  const toggle = async (id: string, currentDone: boolean) => {
    if (toggling.has(id)) return;
    setToggling((s) => new Set(s).add(id));
    // Optimistic update
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? { ...h, doneToday: !currentDone, streak: !currentDone ? h.streak + 1 : Math.max(0, h.streak - 1) }
          : h,
      ),
    );
    try {
      await fetch(`/api/habits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !currentDone }),
      });
    } catch {
      // Revert on failure
      setHabits((prev) =>
        prev.map((h) => (h.id === id ? { ...h, doneToday: currentDone } : h)),
      );
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/habits/${id}`, { method: "DELETE" });
    setHabits((prev) => prev.filter((h) => h.id !== id));
  };

  const addHabit = async () => {
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, frequency: newFreq }),
      });
      const data = await res.json() as { habit?: { id: string; title: string } };
      if (data.habit) {
        setHabits((prev) => [
          ...prev,
          { id: data.habit!.id, title: data.habit!.title, frequency: newFreq, sortOrder: prev.length, doneToday: false, streak: 0 },
        ]);
        setNewTitle("");
        setAdding(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  if (habits.length === 0 && !adding) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-white/30">No habits tracked yet</div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-white/25 hover:text-emerald-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add first habit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {habits.map((h) => {
        const busy = toggling.has(h.id);
        return (
          <div key={h.id} className="group flex items-center gap-3">
            <button
              onClick={() => toggle(h.id, h.doneToday)}
              disabled={busy}
              className="shrink-0 flex items-center justify-center disabled:opacity-50"
              title={h.doneToday ? "Mark undone" : "Mark done"}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-white/30" />
              ) : h.doneToday ? (
                <div className="h-4 w-4 rounded-full bg-emerald-500/80 flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-white" />
                </div>
              ) : (
                <div className="h-4 w-4 rounded-full border border-white/25 hover:border-emerald-400/60 transition-colors" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <span className={`text-sm md:text-base ${h.doneToday ? "text-white/35 line-through" : ""}`}>
                {h.title}
              </span>
              {h.frequency !== HABIT_FREQUENCY.DAILY && (
                <span className="ml-1.5 text-xs text-white/25">{FREQ_LABELS[h.frequency]}</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {h.streak >= 2 && (
                <span className="flex items-center gap-0.5 text-xs text-amber-400/60" title={`${h.streak}-day streak`}>
                  <Flame className="h-3 w-3" />
                  {h.streak}
                </span>
              )}
              <button
                onClick={() => remove(h.id)}
                className="p-1 rounded text-white/10 hover:text-red-400/60 hover:bg-red-400/5 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove habit"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}

      {adding ? (
        <div className="flex gap-2 pt-1">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addHabit(); if (e.key === "Escape") { setAdding(false); setNewTitle(""); } }}
            placeholder="Habit name…"
            autoFocus
            className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
          />
          <select
            value={newFreq}
            onChange={(e) => setNewFreq(e.target.value)}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-white/25"
          >
            {Object.values(HABIT_FREQUENCY).map((f) => (
              <option key={f} value={f}>{FREQ_LABELS[f]}</option>
            ))}
          </select>
          <button
            onClick={addHabit}
            disabled={!newTitle.trim() || saving}
            className="p-1.5 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 text-white transition-colors shrink-0"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            onClick={() => { setAdding(false); setNewTitle(""); }}
            className="p-1.5 rounded text-white/25 hover:text-white/60 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-white/20 hover:text-emerald-400 transition-colors mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add habit
        </button>
      )}
    </div>
  );
}
