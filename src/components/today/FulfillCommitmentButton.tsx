"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { handleFulfillCommitment } from "@/app/actions";

export function FulfillCommitmentButton({ commitmentId }: { commitmentId: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await handleFulfillCommitment(commitmentId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="p-1.5 rounded text-text-muted hover:text-status-positive transition-colors disabled:opacity-50 shrink-0"
      title="Mark fulfilled"
    >
      {busy
        ? <Loader2 className="ui-spinner" />
        : <CheckCircle className="h-4 w-4" />}
    </button>
  );
}
