"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { handleApproveAll } from "@/app/actions";

export function ApproveGroupButton({ ids }: { ids: string[] }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  if (done) {
    return (
      <span className="flex items-center gap-1 text-xs text-status-positive shrink-0">
        <Check className="h-3 w-3" /> All done
      </span>
    );
  }

  return (
    <button
      onClick={async () => {
        setBusy(true);
        setError(false);
        try {
          await handleApproveAll(ids);
          setDone(true);
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      title={error ? "Failed — try again" : undefined}
      className={`ui-btn-confirm-sm shrink-0 ${error ? "opacity-60" : ""}`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      {busy ? "Approving…" : error ? "Retry" : `Approve all (${ids.length})`}
    </button>
  );
}
