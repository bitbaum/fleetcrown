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
    } catch {
      // state unchanged — user can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-overlay hover:text-status-negative disabled:opacity-50 sm:h-auto sm:w-auto sm:p-1"
      title="Abandon goal"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
