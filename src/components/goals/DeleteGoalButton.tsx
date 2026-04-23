"use client";

import { useRouter } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";

export function DeleteGoalButton({ goalId }: { goalId: string }) {
  const router = useRouter();
  return (
    <DeleteButton
      onDelete={async () => {
        await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
        router.refresh();
      }}
      label="Delete?"
      triggerTitle="Delete goal"
      triggerClassName="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-white/20 hover:text-red-400 transition-all shrink-0"
    />
  );
}
