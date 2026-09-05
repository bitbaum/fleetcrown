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
      // Renders inside the goal row's overflow menu (its only call site), so it
      // is a labelled row of words like its neighbours rather than the bare
      // hover-revealed glyph it used to be beside three other glyphs.
      triggerLabel="Delete goal"
      triggerClassName="ui-menu-item ui-menu-item-danger"
    />
  );
}
