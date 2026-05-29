"use client";

import { Search } from "lucide-react";
import { useCommandPalette } from "@/hooks/use-command-palette";

/**
 * Slim app-shell top bar. Universal across every authenticated route.
 *
 * Hosts the command palette trigger (Cmd-K) and is the future home for the
 * push-notification status pill (Stage 5) and any other global chrome. Kept
 * intentionally thin and quiet — pages still own their own page headers.
 */
export function AppTopBar() {
  const { setOpen } = useCommandPalette();
  const platformHint = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

  return (
    <header className="ui-app-topbar">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ui-app-topbar-search"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="ui-app-topbar-search-label">Search prompts, pages, dispatch…</span>
        <kbd className="ui-palette-kbd ml-auto">{platformHint}</kbd>
      </button>
      <div className="ui-app-topbar-right" />
    </header>
  );
}
