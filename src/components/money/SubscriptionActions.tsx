"use client";

import { useState } from "react";
import { X, Lightbulb, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
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
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const meta = SUBSCRIPTION_META[subName];
  if (!meta || status === "cancelled") return null;

  async function onCancel() {
    if (!confirm(`Mark "${subName}" as cancelled in Cockpit?\n\nThis does NOT cancel the actual subscription — you still need to cancel at the provider's website.`)) {
      return;
    }
    setCancelling(true);
    await handleCancelSubscription(subId);
    setCancelled(true);
  }

  if (cancelled) {
    return <span className="text-[10px] text-white/30">Marked cancelled</span>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {/* Cancel at provider */}
      <a
        href={meta.cancelUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-red-400/20 text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors"
      >
        <ExternalLink className="h-2.5 w-2.5" />
        Cancel at {new URL(meta.cancelUrl).hostname.replace("www.", "")}
      </a>

      {/* Mark as cancelled in Cockpit */}
      <button
        onClick={onCancel}
        disabled={cancelling}
        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-white/10 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors disabled:opacity-50"
      >
        <X className="h-2.5 w-2.5" />
        Mark cancelled
      </button>

      {/* Show alternatives */}
      {!meta.essential && meta.alternatives.length > 0 && (
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-emerald-400/20 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-400/5 transition-colors"
        >
          <Lightbulb className="h-2.5 w-2.5" />
          Free alternatives
          {showAlternatives ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        </button>
      )}

      {showAlternatives && (
        <div className="w-full mt-1 p-2 rounded bg-emerald-400/5 border border-emerald-400/10">
          <div className="text-[10px] text-emerald-400/60 font-medium mb-1">Alternatives:</div>
          {meta.alternatives.map((alt, i) => (
            <div key={i} className="text-[10px] text-white/40">• {alt}</div>
          ))}
        </div>
      )}
    </div>
  );
}
