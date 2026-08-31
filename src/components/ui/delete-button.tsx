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
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      setConfirming(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-1">
          {label && <span className="text-xs text-text-tertiary">{label}</span>}
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="text-xs text-status-negative hover:text-status-negative transition-colors px-1 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="ui-spinner-xs" /> : "Yes"}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setDeleteError(null);
            }}
            className="ui-btn-text-cancel"
          >
            No
          </button>
        </div>
        {deleteError && <p className="ui-error-xs">{deleteError}</p>}
      </div>
    );
  }

  // aria-label, not just title: this trigger is a bare trash glyph, so a
  // `title` was its ONLY name — and a title is announced inconsistently by
  // screen readers and never shown at all on a touch screen. Nine call sites
  // shared the gap, one of them "Forget this entity" on /memory. The tap floor
  // is a marker class, so the 44px number stays stated once in globals.css.
  return (
    <button
      onClick={() => setConfirming(true)}
      className={`ui-delete-trigger ${triggerClassName}`}
      title={triggerTitle}
      aria-label={triggerTitle}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
