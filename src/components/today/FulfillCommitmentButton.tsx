"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { handleFulfillCommitment } from "@/app/actions";

export function FulfillCommitmentButton({ commitmentId }: { commitmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      await handleFulfillCommitment(commitmentId);
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
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-status-positive disabled:opacity-50 sm:h-auto sm:w-auto sm:p-1.5"
        title="Mark fulfilled"
      >
        {busy
          ? <Loader2 className="ui-spinner" />
          : <CheckCircle className="h-4 w-4" />}
      </button>
    </div>
  );
}
