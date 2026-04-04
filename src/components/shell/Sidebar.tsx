"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-border bg-sidebar">
      <div className="flex h-14 items-center px-4 border-b border-border">
        <span className="text-lg font-semibold tracking-tight">
          <span className="mr-1.5">🌿</span>Cockpit
        </span>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5",
                !item.active && "opacity-40"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {!item.active && (
                <span className="ml-auto text-[10px] uppercase tracking-wider opacity-60">soon</span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
