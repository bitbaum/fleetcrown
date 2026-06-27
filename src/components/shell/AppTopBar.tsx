"use client";

import { Search, LayoutPanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { NotificationsPill } from "./NotificationsPill";
import { FleetRunnerStatusPill } from "@/components/desktop/FleetRunnerStatusPill";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { NAV_ITEMS } from "@/config/navigation";
import { isCurrentPath } from "@/lib/navigation";

/**
 * Slim app-shell top bar. Universal across every authenticated route.
 *
 * Hosts the command palette trigger (Cmd-K) and the push-notification status
 * pill. Pages still own their own page headers; this bar is intentionally
 * quiet — chrome that signals state, not content.
 *
 * Mobile shape: the full-width search button collapses to a header that
 * shows the current page name on the left and an icon-only search trigger
 * on the right. Phone users get a clear "where am I?" cue without
 * sacrificing the search affordance.
 */
export function AppTopBar({
  onOpenSessions,
}: {
  /** Toggles the cross-page Sessions drawer (project inventory + status).
   *  Optional so AppTopBar can also be rendered in isolation/storybook. */
  onOpenSessions?: () => void;
}) {
  const { setOpen } = useCommandPalette();
  const pathname = usePathname();
  const platformHint = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

  // Resolve the active route to the same label the sidebar/More sheet uses.
  // Falls back to empty string for pages outside the nav config (sign-in,
  // /u/<username>, etc.) so the top bar stays clean rather than guessing.
  const currentNavItem = NAV_ITEMS.find((item) => isCurrentPath(pathname, item.href));
  const pageLabel = currentNavItem?.label ?? "";

  return (
    <header className="ui-app-topbar">
      {/* Mobile-only page title — bottom nav already tells "where", but a
          glance up should confirm it. md+ users see the full sidebar so the
          title is redundant there. */}
      {pageLabel && (
        <h1 className="truncate text-base font-semibold text-text-primary md:hidden">
          {pageLabel}
        </h1>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ui-app-topbar-search hidden md:flex"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="ui-app-topbar-search-label">Search prompts, pages, dispatch…</span>
        <kbd className="ui-palette-kbd ml-auto">{platformHint}</kbd>
      </button>
      <div className="ui-app-topbar-right">
        {/* Mobile-only icon search — same palette, just less chrome. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-raised hover:text-text-secondary md:hidden"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
        {/* Sessions drawer toggle — cross-page project inventory + status. */}
        {onOpenSessions && (
          <button
            type="button"
            onClick={onOpenSessions}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-raised hover:text-text-secondary"
            aria-label="Open Sessions drawer"
            title="Sessions"
          >
            <LayoutPanelLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <ThemeToggle />
        <FleetRunnerStatusPill />
        <NotificationsPill />
      </div>
    </header>
  );
}
