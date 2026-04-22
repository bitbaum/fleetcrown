"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Lightbulb, ExternalLink, ChevronDown, ChevronUp, Trash2, Loader2 } from "lucide-react";
import { handleCancelSubscription } from "@/app/actions";
import { SUBSCRIPTION_META } from "@/config/subscriptions";

export function SubscriptionActions({
  subId,
  subName,
  status,
}: {
  subId: string;
  subName: string;
  status: string | null;
}) {
  const router = useRouter();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const meta = SUBSCRIPTION_META[subName];
  const isCancelled = status === "cancelled";

  async function onCancel() {
    setCancelling(true);
    await handleCancelSubscription(subId);
    setCancelled(true);
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/subscriptions/${subId}`, { method: "DELETE" });
      setDeleted(true);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) return null;

  if (cancelled) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-white/30">Marked cancelled</span>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-white/40">Delete record?</span>
            <button onClick={onDelete} disabled={deleting}
              className="text-xs text-red-400 hover:text-red-300 px-1 disabled:opacity-50">
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="text-xs text-white/30 hover:text-white/60 px-1">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1 text-xs text-white/20 hover:text-red-400 transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {/* Cancel at provider — only when meta is configured */}
      {meta && (
        <a
          href={meta.cancelUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-400/20 text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Cancel at {new URL(meta.cancelUrl).hostname.replace("www.", "")}
        </a>
      )}

      {/* Mark as cancelled — inline confirm */}
      {!isCancelled && (confirmCancel ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/40">Mark cancelled?</span>
          <button onClick={onCancel} disabled={cancelling}
            className="text-xs text-red-400 hover:text-red-300 transition-colors px-1 disabled:opacity-50">
            Yes
          </button>
          <button onClick={() => setConfirmCancel(false)}
            className="text-xs text-white/30 hover:text-white/60 transition-colors px-1">
            No
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmCancel(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/10 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
          <X className="h-2.5 w-2.5" />
          Mark cancelled
        </button>
      ))}

      {/* Delete record permanently */}
      {confirmDelete ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/40">Delete record?</span>
          <button onClick={onDelete} disabled={deleting}
            className="text-xs text-red-400 hover:text-red-300 transition-colors px-1 disabled:opacity-50">
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
          </button>
          <button onClick={() => setConfirmDelete(false)}
            className="text-xs text-white/30 hover:text-white/60 transition-colors px-1">
            No
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/10 text-white/20 hover:text-red-400 hover:bg-red-400/5 transition-colors"
          title="Delete subscription record">
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}

      {/* Free alternatives — only when meta is configured */}
      {meta && !meta.essential && meta.alternatives.length > 0 && (
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-400/20 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-400/5 transition-colors"
        >
          <Lightbulb className="h-2.5 w-2.5" />
          Free alternatives
          {showAlternatives ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        </button>
      )}

      {showAlternatives && meta && (
        <div className="w-full mt-1 p-2 rounded bg-emerald-400/5 border border-emerald-400/10">
          <div className="text-xs text-emerald-400/60 font-medium mb-1">Alternatives:</div>
          {meta.alternatives.map((alt, i) => (
            <div key={i} className="text-xs text-white/40">• {alt}</div>
          ))}
        </div>
      )}
    </div>
  );
}
