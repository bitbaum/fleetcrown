"use client";

import { Search } from "lucide-react";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { NotificationsPill } from "./NotificationsPill";

/**
 * Slim app-shell top bar. Universal across every authenticated route.
 *
 * Hosts the command palette trigger (Cmd-K) and the push-notification status
 * pill. Pages still own their own page headers; this bar is intentionally
 * quiet — chrome that signals state, not content.
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
      <div className="ui-app-topbar-right">
        <NotificationsPill />
      </div>
    </header>
  );
}
