"use client";

import Link from "next/link";
import { PanelLeftOpen, PanelLeftClose, LogOut, Lock, Settings as SettingsIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { usePrivateZone } from "@/hooks/use-private-zone";
import { ROUTES } from "@/config/auth";
import { NAV } from "@/config/navigation";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

// The Light/Dark/Auto switch lives here (compact, icon-only) AND in Settings →
// Appearance — both render the shared <ThemeToggle/> (SSOT). It was sidebar-
// less for a while, but users couldn't find theme at all; a small icon row is
// worth the slot. Hidden when the sidebar is collapsed (no room).

export function SidebarFooter({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { unlocked, lock, configured } = usePrivateZone();

  return (
    <div className="ui-sidebar-section space-y-1 border-t border-border-subtle">
      {!collapsed && <ThemeToggle className="mb-1" />}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className={cn(
          "xl:hidden",
          collapsed ? "ui-btn-icon mx-auto flex" : "ui-sidebar-utility w-full",
        )}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed
          ? <PanelLeftOpen className="h-4 w-4" />
          : <><PanelLeftClose className="h-4 w-4 shrink-0" /><span>Collapse</span></>}
      </button>
      <Link
        href={NAV.settings.href}
        className={cn(
          "ui-sidebar-utility group relative w-full",
          collapsed && "justify-center px-2",
        )}
      >
        <SettingsIcon className="h-4 w-4 shrink-0" />
        {!collapsed && "Settings"}
        {collapsed && <span className="ui-sidebar-tooltip">Settings</span>}
      </Link>
      {configured && unlocked && (
        <button
          onClick={lock}
          className={cn(
            "ui-sidebar-utility group relative w-full",
            collapsed && "justify-center px-2",
          )}
        >
          <Lock className="h-4 w-4 shrink-0" />
          {!collapsed && "Lock private zone"}
          {collapsed && <span className="ui-sidebar-tooltip">Lock private zone</span>}
        </button>
      )}
      <button
        onClick={() => signOut({ callbackUrl: ROUTES.SIGN_IN })}
        className={cn(
          "ui-sidebar-utility group relative w-full",
          collapsed && "justify-center px-2",
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && "Sign out"}
        {collapsed && <span className="ui-sidebar-tooltip">Sign out</span>}
      </button>
    </div>
  );
}
