"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";

/**
 * Inline delete with two-step confirm. Manages its own confirming/deleting state.
 * The parent provides `onDelete` — an async function that does the actual fetch + side effects.
 */
export function DeleteButton({
  onDelete,
  label = "Delete?",
  triggerTitle = "Delete",
  triggerClassName = "p-1.5 rounded text-text-muted hover:text-status-negative hover:bg-surface-raised transition-colors",
}: {
  onDelete: () => Promise<void>;
  label?: string;
  triggerTitle?: string;
  triggerClassName?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {label && <span className="text-xs text-text-tertiary">{label}</span>}
        <button
          onClick={handleConfirm}
          disabled={deleting}
          className="text-xs text-status-negative hover:text-status-negative transition-colors px-1 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="ui-spinner-xs" /> : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="ui-btn-text-cancel"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={triggerClassName}
      title={triggerTitle}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
