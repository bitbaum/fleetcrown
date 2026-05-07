"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { APP_HOME_HREF } from "@/config/shell";
import { CockpitMark } from "../CockpitMark";

export function SidebarBrand({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <div className="ui-sidebar-section border-b border-border-subtle">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={APP_HOME_HREF}
          className="min-w-0 rounded-xl outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <CockpitMark compact={collapsed} />
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ui-btn-icon hidden xl:inline-flex"
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
