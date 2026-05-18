"use client";

import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api/fetch";
import { AddHabitForm } from "@/components/today/AddHabitForm";
import type { HabitFrequency } from "@/lib/constants/statuses";

export function AddHabitButton({ emptyState = false }: { emptyState?: boolean }) {
  const router = useRouter();

  const create = async (input: { title: string; frequency: HabitFrequency }): Promise<boolean> => {
    try {
      const res = await postJson("/api/habits", input);
      const data = (await res.json()) as { habit?: { id: string } };
      if (!data.habit) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    }
  };

  return <AddHabitForm onCreated={create} emptyState={emptyState} />;
}
