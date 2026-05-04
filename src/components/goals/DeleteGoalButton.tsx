"use client";

import { useRouter } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteGoal } from "@/lib/api/goals";

export function DeleteGoalButton({ goalId }: { goalId: string }) {
  const router = useRouter();
  return (
    <DeleteButton
      onDelete={async () => {
        await deleteGoal(goalId);
        router.refresh();
      }}
      label="Delete?"
      triggerTitle="Delete goal"
      triggerClassName="ui-hover-reveal p-1 rounded text-text-muted hover:text-status-negative transition-all shrink-0"
    />
  );
}
