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
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setBusy(true);
    setError(null);
    try {
      await handleApprove(actionId);
      setDone(ACTION_STATUS.APPROVED);
    } catch {
      setError("Failed — try again");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    setBusy(true);
    setError(null);
    try {
      await handleReject(actionId);
      setDone(ACTION_STATUS.REJECTED);
    } catch {
      setError("Failed — try again");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className={`text-xs ${done === ACTION_STATUS.APPROVED ? "text-status-positive" : "text-text-muted"}`}>
        {done === ACTION_STATUS.APPROVED ? "✓" : "✗"}
      </span>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {error && <span className="text-[10px] text-status-negative mr-1">{error}</span>}
        <button
          onClick={onApprove}
          disabled={busy}
          className="flex items-center justify-center rounded p-3 min-h-[44px] min-w-[44px] hover:bg-status-positive/20 text-status-positive/60 hover:text-status-positive transition-colors disabled:opacity-50"
          title="Done — mark as completed"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="flex items-center justify-center rounded p-3 min-h-[44px] min-w-[44px] hover:bg-surface-raised text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
          title="Skip — dismiss this action"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 mt-3">
      {error && <p className="ui-error-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={busy}
          className="ui-btn-confirm-sm"
        >
          <Check className="h-3 w-3" />
          Done
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border-subtle hover:bg-surface-raised text-text-secondary transition-colors disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          Skip
        </button>
      </div>
    </div>
  );
}
