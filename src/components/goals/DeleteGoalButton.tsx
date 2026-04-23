"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteGoalButton({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  if (deleting) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30 shrink-0" />;
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-white/40">Delete?</span>
        <button
          onClick={handleDelete}
          className="text-xs text-red-400 hover:text-red-300 transition-colors px-1"
        >
          Yes
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
      className="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-white/20 hover:text-red-400 transition-all shrink-0"
      title="Delete goal"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
