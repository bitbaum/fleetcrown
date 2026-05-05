"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { handleDismissAlert } from "@/app/actions";

export function DismissAlertButton({ alertId }: { alertId: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await handleDismissAlert(alertId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
      title="Dismiss"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
