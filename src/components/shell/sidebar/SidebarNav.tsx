"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { SIDEBAR_SECTIONS, type SidebarSection } from "@/config/navigation";
import { isCurrentPath } from "@/lib/navigation";
import { usePrivateZone } from "@/hooks/use-private-zone";
import { SidebarNavItem } from "./SidebarNavItem";

export function SidebarNav({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  const { configured, unlocked } = usePrivateZone();
  const privateLocked = configured && !unlocked;

  return (
    <nav className={collapsed ? "px-2 py-4 space-y-6" : "px-3 py-4 space-y-6"}>
      {SIDEBAR_SECTIONS.map((section) => (
        <SidebarNavSection
          key={section.id}
          section={section}
          pathname={pathname}
          collapsed={collapsed}
          privateLocked={privateLocked}
        />
      ))}
    </nav>
  );
}

function SidebarNavSection({
  section,
  pathname,
  collapsed,
  privateLocked,
}: {
  section: SidebarSection;
  pathname: string;
  collapsed: boolean;
  privateLocked: boolean;
}) {
  const isLocked = Boolean(section.private && privateLocked);

  return (
    <div>
      {!collapsed && (
        <div className="ui-sidebar-section-header">
          <span>{section.label}</span>
          {section.private && (
            <Lock className={isLocked ? "ui-sidebar-section-lock-active" : "ui-sidebar-section-lock"} />
          )}
        </div>
      )}

      {isLocked ? (
        <Link href="/unlock" className="ui-sidebar-private-unlock" aria-label="Unlock private section">
          <Lock className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Unlock to view</span>}
        </Link>
      ) : (
        <div className="space-y-1.5">
          {section.items.map((item) => (
            <SidebarNavItem
              key={item.id}
              item={item}
              current={isCurrentPath(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
}
