"use client";

import { X, Loader2 } from "lucide-react";
import { useState } from "react";
import { handleDismissAlert } from "@/app/actions";

export function DismissAlertButton({ alertId }: { alertId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      await handleDismissAlert(alertId);
    } catch {
      setError("Failed — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      {error && <span className="ui-error-xs">{error}</span>}
      <button
        onClick={onClick}
        disabled={busy}
        className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
        title="Dismiss"
      >
        {busy ? <Loader2 className="ui-spinner" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
