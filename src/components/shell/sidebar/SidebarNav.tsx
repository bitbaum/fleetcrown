"use client";

import { NAV_ITEMS } from "@/config/navigation";
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
    </nav>
  );
}
