"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HabitWithStatus } from "@/db/queries/habits";
import type { HabitFrequency } from "@/lib/constants/statuses";
import { HabitRow } from "./HabitRow";
import { AddHabitForm } from "./AddHabitForm";

export function HabitsList({ initialHabits }: { initialHabits: HabitWithStatus[] }) {
  const router = useRouter();
  const [habits, setHabits] = useState(initialHabits);

  const toggle = async (id: string, currentDone: boolean) => {
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
      setHabits((prev) =>
        prev.map((h) => (h.id === id ? { ...h, doneToday: currentDone } : h)),
      );
    }
  };

  const editHabit = async (
    id: string,
    patch: { title: string; frequency: HabitFrequency },
  ): Promise<boolean> => {
    const res = await fetch(`/api/habits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return false;
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    return true;
  };

  const removeHabit = async (id: string) => {
    await fetch(`/api/habits/${id}`, { method: "DELETE" });
    setHabits((prev) => prev.filter((h) => h.id !== id));
  };

  const addHabit = async (input: { title: string; frequency: HabitFrequency }): Promise<boolean> => {
    const res = await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json() as { habit?: { id: string; title: string } };
    if (!data.habit) return false;
    setHabits((prev) => [
      ...prev,
      {
        id: data.habit!.id,
        title: data.habit!.title,
        frequency: input.frequency,
        sortOrder: prev.length,
        doneToday: false,
        streak: 0,
      },
    ]);
    router.refresh();
    return true;
  };

  if (habits.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-white/30">No habits tracked yet</div>
        <AddHabitForm onCreated={addHabit} emptyState />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {habits.map((h) => (
        <HabitRow
          key={h.id}
          habit={h}
          onToggle={toggle}
          onEdit={editHabit}
          onRemove={removeHabit}
        />
      ))}
      <AddHabitForm onCreated={addHabit} />
    </div>
  );
}
