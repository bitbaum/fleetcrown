"use client";

import { Check, X } from "lucide-react";
import { handleApprove, handleReject } from "@/app/actions";
import { useState } from "react";

export function ActionButtons({ actionId }: { actionId: string }) {
  const [busy, setBusy] = useState(false);

  async function onApprove() {
    setBusy(true);
    await handleApprove(actionId);
  }

  async function onReject() {
    setBusy(true);
    await handleReject(actionId);
  }

  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={onApprove}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
      >
        <Check className="h-3 w-3" />
        Approve
      </button>
      <button
        onClick={onReject}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-white/10 hover:bg-white/5 text-white/60 transition-colors disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        Reject
      </button>
    </div>
  );
}
