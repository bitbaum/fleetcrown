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
  triggerClassName = "p-1.5 rounded text-white/20 hover:text-red-400 hover:bg-white/5 transition-colors",
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
        {label && <span className="text-xs text-white/40">{label}</span>}
        <button
          onClick={handleConfirm}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-300 transition-colors px-1 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-white/30 hover:text-white/60 transition-colors px-1"
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
