"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SidebarBrand } from "./sidebar/SidebarBrand";
import { SidebarNav } from "./sidebar/SidebarNav";
import { SidebarFooter } from "./sidebar/SidebarFooter";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn("ui-sidebar hidden md:flex md:flex-col", collapsed ? "md:w-20" : "md:w-72")}
    >
      <SidebarBrand collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav pathname={pathname} collapsed={collapsed} />
      </div>
      <SidebarFooter collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
    </aside>
  );
}
