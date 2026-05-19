"use client";

import { useState, useEffect } from "react";
import { PanelLeftOpen, LogOut, Lock, Sun, Moon } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { usePrivateZone } from "@/hooks/use-private-zone";
import { ROUTES } from "@/config/auth";

export function SidebarFooter({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { unlocked, lock } = usePrivateZone();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard next-themes SSR hydration guard
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme !== "light";

  return (
    <div className="ui-sidebar-section space-y-1 border-t border-border-subtle">
      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ui-btn-icon mx-auto flex xl:hidden"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
      {unlocked && (
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
      {mounted && (
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={cn(
            "ui-sidebar-utility group relative w-full",
            collapsed && "justify-center px-2",
          )}
        >
          {isDark
            ? <Sun className="h-4 w-4 shrink-0" />
            : <Moon className="h-4 w-4 shrink-0" />}
          {!collapsed && (isDark ? "Light mode" : "Dark mode")}
          {collapsed && <span className="ui-sidebar-tooltip">{isDark ? "Light mode" : "Dark mode"}</span>}
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
