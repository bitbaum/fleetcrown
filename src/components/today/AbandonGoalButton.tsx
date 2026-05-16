"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { handleAbandonGoal } from "@/app/actions";

export function AbandonGoalButton({ goalId }: { goalId: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await handleAbandonGoal(goalId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-status-negative transition-colors disabled:opacity-50 shrink-0"
      title="Abandon goal"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
