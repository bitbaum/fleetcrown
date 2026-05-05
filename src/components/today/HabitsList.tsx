"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HabitWithStatus } from "@/db/queries/habits";
import type { HabitFrequency } from "@/lib/constants/statuses";
import { HabitRow } from "./HabitRow";
import { AddHabitForm } from "./AddHabitForm";
import { EmptyState } from "@/components/ui/empty-state";
import { postJson, patchJson, deleteJson } from "@/lib/api/fetch";

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
      const res = await patchJson(`/api/habits/${id}`, { done: !currentDone });
      if (!res.ok) throw new Error("Failed");
      router.refresh();
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
    const res = await patchJson(`/api/habits/${id}`, patch);
    if (!res.ok) return false;
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    return true;
  };

  const removeHabit = async (id: string) => {
    const res = await deleteJson(`/api/habits/${id}`);
    if (!res.ok) return;
    setHabits((prev) => prev.filter((h) => h.id !== id));
    router.refresh();
  };

  const addHabit = async (input: { title: string; frequency: HabitFrequency }): Promise<boolean> => {
    const res = await postJson("/api/habits", input);
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
        <EmptyState>No habits tracked yet</EmptyState>
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
