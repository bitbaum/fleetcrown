"use client";

import { NAV_ITEMS, SITE_NAV_ITEMS } from "@/config/navigation";
import { isCurrentPath } from "@/lib/navigation";
import { SidebarNavItem } from "./SidebarNavItem";

export function SidebarNav({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <nav className={collapsed ? "px-2 py-4" : "px-3 py-4"}>
      <div className="space-y-1.5">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.id}
            item={item}
            current={isCurrentPath(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>

      <div className="mt-6 border-t border-border-subtle pt-4">
        {!collapsed && (
          <div className="mb-2 px-3 text-micro font-semibold uppercase tracking-caps text-text-muted">
            Site
          </div>
        )}
        <div className="space-y-1.5">
          {SITE_NAV_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.id}
              item={item}
              current={isCurrentPath(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
