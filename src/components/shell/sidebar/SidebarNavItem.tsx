"use client";

import Link from "next/link";
import type { NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function SidebarNavItem({
  item,
  current,
  collapsed,
}: {
  item: NavItem;
  current: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "ui-nav-item ui-sidebar-nav-item group relative",
        collapsed ? "justify-center px-2 py-3" : "",
        current && "ui-nav-item-active",
        !item.active && "opacity-40",
      )}
      aria-label={collapsed ? item.label : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && (
        <div className="min-w-0">
          <span className="block">{item.label}</span>
          <span className="mt-0.5 block text-xs text-text-tertiary">{item.description}</span>
        </div>
      )}
      {!collapsed && !item.active && <span className="ml-auto ui-micro-label">soon</span>}
      {collapsed && <span className="ui-sidebar-tooltip">{item.label}</span>}
    </Link>
  );
}
