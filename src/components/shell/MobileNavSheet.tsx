"use client";

import Link from "next/link";
import { LogOut, Lock, Settings as SettingsIcon, X } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  MOBILE_NAV_ITEMS,
  NAV,
  SIDEBAR_SECTIONS,
  type NavItem,
  type SidebarSection,
} from "@/config/navigation";
import { isCurrentPath } from "@/lib/navigation";
import { ROUTES } from "@/config/auth";
import { cn } from "@/lib/utils";
import { usePrivateZone } from "@/hooks/use-private-zone";
import { useEscapeToClose } from "@/hooks/use-escape-to-close";
import { useOverlayLock } from "@/hooks/use-overlay-lock";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

const TAB_IDS = new Set(MOBILE_NAV_ITEMS.map((item) => item.id));

function sheetItems(section: SidebarSection): NavItem[] {
  return section.items.filter((item) => !TAB_IDS.has(item.id));
}

function MobileNavRow({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const isActive = isCurrentPath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn("ui-mobile-nav-row", isActive && "ui-mobile-nav-row-active")}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.label}</span>
        <span className="block truncate text-xs text-text-tertiary">{item.description}</span>
      </span>
    </Link>
  );
}

export function MobileNavSheet({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const { configured, unlocked } = usePrivateZone();
  const privateLocked = configured && !unlocked;

  // This is a dialog covering the app, so it owes the same two things every
  // other overlay here provides. Verified against prod before this line existed:
  // Escape left the sheet open, and the page kept scrolling behind it.
  useEscapeToClose(onClose);
  useOverlayLock(true);

  return (
    <>
      <div
        className="fixed inset-0 z-30 ui-backdrop md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="ui-mobile-nav-sheet" role="dialog" aria-label="Navigation">
        <div className="ui-mobile-nav-sheet-header">
          <span className="text-sm font-semibold text-text-primary">Navigate</span>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn-icon min-h-11 min-w-11"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="ui-mobile-nav-sheet-scroll">
          {SIDEBAR_SECTIONS.map((section) => {
            const items = sheetItems(section);
            if (items.length === 0) return null;

            if (section.private && privateLocked) {
              return (
                <div key={section.id} className="px-3 pb-2">
                  <p className="ui-mobile-nav-sheet-label">{section.label}</p>
                  <Link href="/unlock" onClick={onClose} className="ui-mobile-nav-row">
                    <Lock className="h-5 w-5 shrink-0 text-accent-text" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">Unlock private zone</span>
                      <span className="block text-xs text-text-tertiary">
                        People, goals, habits, events, money, memory
                      </span>
                    </span>
                  </Link>
                </div>
              );
            }

            return (
              <div key={section.id} className="px-3 pb-2">
                <p className="ui-mobile-nav-sheet-label">{section.label}</p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <MobileNavRow
                      key={item.id}
                      item={item}
                      pathname={pathname}
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="ui-mobile-nav-sheet-footer">
          <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2">
            <span className="text-sm text-text-secondary">Appearance</span>
            <ThemeToggle showLabel />
          </div>
          <Link href={NAV.settings.href} onClick={onClose} className="ui-mobile-nav-row">
            <SettingsIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">{NAV.settings.label}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose();
              signOut({ callbackUrl: ROUTES.SIGN_IN });
            }}
            className="ui-mobile-nav-row text-text-secondary"
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </div>
    </>
  );
}
