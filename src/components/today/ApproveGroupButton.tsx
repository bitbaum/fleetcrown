"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { handleApproveAll } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { ACTION_COPY } from "@/config/action-copy";

export function ApproveGroupButton({
  ids,
  onDone,
}: {
  ids: string[];
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  if (done) {
    return (
      <p className="text-xs text-text-secondary">
        {ACTION_COPY.checkin.remindedAll(ids.length)}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        haptic();
        setBusy(true);
        setError(false);
        try {
          await handleApproveAll(ids);
          setDone(true);
          onDone?.();
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      title={ACTION_COPY.checkin.groupWhy}
      className={`ui-btn-confirm-sm shrink-0 ${error ? "opacity-60" : ""}`}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {busy ? "Saving…" : error ? "Retry" : ACTION_COPY.checkin.remindAll(ids.length)}
    </button>
  );
}
