"use client";

import { PanelLeftOpen, LogOut, Lock } from "lucide-react";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "../ThemeToggle";
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

  return (
    <div className="ui-sidebar-section space-y-2 border-t border-border-subtle">
      <ThemeToggle compact={collapsed} />
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
            "ui-sidebar-utility w-full",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Lock private zone" : undefined}
        >
          <Lock className="h-4 w-4 shrink-0" />
          {!collapsed && "Lock private zone"}
        </button>
      )}
      <button
        onClick={() => signOut({ callbackUrl: ROUTES.SIGN_IN })}
        className={cn(
          "ui-sidebar-utility w-full",
          collapsed && "justify-center px-2",
        )}
        title={collapsed ? "Sign out" : undefined}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && "Sign out"}
      </button>
    </div>
  );
}
