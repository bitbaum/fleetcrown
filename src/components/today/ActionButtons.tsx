"use client";

import { Check, X } from "lucide-react";
import { handleApprove, handleReject } from "@/app/actions";
import { useState } from "react";
import { ACTION_STATUS } from "@/lib/constants/statuses";

type DoneStatus = typeof ACTION_STATUS.APPROVED | typeof ACTION_STATUS.REJECTED;

export function ActionButtons({
  actionId,
  compact,
}: {
  actionId: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DoneStatus | null>(null);

  async function onApprove() {
    setBusy(true);
    await handleApprove(actionId);
    setDone(ACTION_STATUS.APPROVED);
  }

  async function onReject() {
    setBusy(true);
    await handleReject(actionId);
    setDone(ACTION_STATUS.REJECTED);
  }

  if (done) {
    return (
      <span className={`text-xs ${done === ACTION_STATUS.APPROVED ? "text-emerald-400" : "text-white/30"}`}>
        {done === ACTION_STATUS.APPROVED ? "✓" : "✗"}
      </span>
    );
  }

  if (compact) {
    return (
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onApprove}
          disabled={busy}
          className="p-1 rounded hover:bg-emerald-600/20 text-emerald-400/60 hover:text-emerald-400 transition-colors disabled:opacity-50"
          title="Done — mark as completed"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="p-1.5 rounded hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors disabled:opacity-50"
          title="Skip — dismiss this action"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={onApprove}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
      >
        <Check className="h-3 w-3" />
        Done
      </button>
      <button
        onClick={onReject}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-white/10 hover:bg-white/5 text-white/60 transition-colors disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        Skip
      </button>
    </div>
  );
}
