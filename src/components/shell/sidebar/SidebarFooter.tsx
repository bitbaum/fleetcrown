"use client";

import Link from "next/link";
import {
  PanelLeftOpen,
  PanelLeftClose,
  LogOut,
  Lock,
  Settings as SettingsIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { usePrivateZone } from "@/hooks/use-private-zone";
import { ROUTES } from "@/config/auth";
import { NAV } from "@/config/navigation";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

// The theme switch is a single cycle control (ThemeToggle) in the sidebar footer,
// app top bar, and mobile menu — not three separate buttons.

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
      <ThemeToggle
        showLabel={!collapsed}
        className={cn(collapsed ? "mx-auto" : "w-full justify-start ui-theme-cycle-btn-labeled")}
      />
      <button
        type="button"
        onClick={onToggleCollapsed}
        className={cn(
          "md:hidden",
          collapsed ? "ui-btn-icon mx-auto flex" : "ui-sidebar-utility w-full",
        )}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4 shrink-0" />
            <span>Collapse</span>
          </>
        )}
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
