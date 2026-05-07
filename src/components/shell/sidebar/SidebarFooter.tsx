"use client";

import { PanelLeftOpen, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "../ThemeToggle";
import { cn } from "@/lib/utils";

export function SidebarFooter({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
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
      <button
        onClick={() => signOut({ callbackUrl: "/sign-in" })}
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
