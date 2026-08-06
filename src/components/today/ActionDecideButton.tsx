"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { ActionDecisionModal } from "./ActionDecisionModal";

/**
 * Opens the decision popup for one queued action.
 *
 * `autoOpen` is for the Approvals page, where reviewing IS the reason you
 * arrived — the top proposal opens itself. Once per action id (localStorage),
 * so a popup you already dismissed does not reappear on every navigation.
 */
const seenKey = (actionId: string) => `fleetcrown.advice.seen.${actionId}`;

export function ActionDecideButton({
  actionId,
  autoOpen = false,
}: {
  actionId: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoOpen) return;
    try {
      if (localStorage.getItem(seenKey(actionId))) return;
      localStorage.setItem(seenKey(actionId), "1");
    } catch { /* private mode — fall through and open once */ }
    // Deferred rather than opened in the effect body: the queue paints first,
    // so the popup arrives over a page you can already read (and React is not
    // asked to cascade a render during mount).
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, [autoOpen, actionId]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="ui-btn-primary text-xs">
        <Sparkles className="h-3 w-3" />
        Decide
      </button>
      {open && <ActionDecisionModal actionId={actionId} onClose={() => setOpen(false)} />}
    </>
  );
}
