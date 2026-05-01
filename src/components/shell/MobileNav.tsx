"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";

const MOBILE_TABS = NAV_ITEMS.filter((item) => item.mobile);

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-3 inset-x-3 z-50 flex md:hidden rounded-[1.75rem] border border-border-default bg-surface-base/92 px-2 py-2 backdrop-blur-xl shadow-[var(--shadow-panel-strong)]">
      {MOBILE_TABS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-3 text-xs font-medium transition-colors",
              isActive ? "bg-accent-muted text-text-primary" : "text-text-muted"
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
