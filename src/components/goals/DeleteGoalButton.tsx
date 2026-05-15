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
      triggerClassName="ui-hover-reveal inline-flex min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 items-center justify-center p-1 rounded text-text-muted hover:text-status-negative transition-all shrink-0"
    />
  );
}
