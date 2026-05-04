"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { deleteJson } from "@/lib/api/fetch";

export function DeleteCommitmentButton({ commitmentId }: { commitmentId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteJson(`/api/commitments/${commitmentId}`);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-xs text-status-negative hover:text-status-negative/80 transition-colors px-1 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Del"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors px-1"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="p-1 rounded text-text-muted hover:text-status-negative/70 transition-colors shrink-0"
      title="Remove commitment"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
