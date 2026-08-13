"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { handleApprove, handleReject } from "@/app/actions";
import { useState } from "react";
import { ACTION_STATUS } from "@/lib/constants/statuses";
import { haptic } from "@/lib/haptics";
import { ACTION_COPY } from "@/config/action-copy";
import { NAV } from "@/config/navigation";

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
  const [projectKey, setProjectKey] = useState<string | null>(null);

  async function onApprove() {
    haptic();
    setBusy(true);
    setError(null);
    try {
      const result = await handleApprove(actionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setProjectKey(result.projectKey ?? null);
      setDone(ACTION_STATUS.APPROVED);
    } catch {
      setError("Failed — try again");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    haptic();
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
    if (done === ACTION_STATUS.APPROVED && projectKey) {
      return (
        <Link
          href={`${NAV.control.href}?project=${encodeURIComponent(projectKey)}`}
          className="ui-link-subtle text-xs"
        >
          {ACTION_COPY.dispatch.watch}
        </Link>
      );
    }
    return (
      <span className={`text-xs ${done === ACTION_STATUS.APPROVED ? "text-status-positive" : "text-text-muted"}`}>
        {done === ACTION_STATUS.APPROVED ? ACTION_COPY.checkin.reminded : "Skipped"}
      </span>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {error && <span className="ui-error-xs mr-1">{error}</span>}
        <button
          onClick={onApprove}
          disabled={busy}
          className="flex items-center justify-center rounded p-3 min-h-11 min-w-11 hover:bg-status-positive/20 text-status-positive/60 hover:text-status-positive transition-colors disabled:opacity-50"
          title="Done — mark as completed"
          aria-label="Mark action as done"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="flex items-center justify-center rounded p-3 min-h-11 min-w-11 hover:bg-surface-raised text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
          title="Skip — dismiss this action"
          aria-label="Skip this action"
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
