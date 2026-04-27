"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { handleFulfillCommitment } from "@/app/actions";

export function FulfillCommitmentButton({ commitmentId }: { commitmentId: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    await handleFulfillCommitment(commitmentId);
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="p-1.5 rounded text-white/20 hover:text-green-400 transition-colors disabled:opacity-50 shrink-0"
      title="Mark fulfilled"
    >
      {busy
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <CheckCircle className="h-4 w-4" />}
    </button>
  );
}
