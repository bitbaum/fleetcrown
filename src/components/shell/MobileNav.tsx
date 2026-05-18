"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { MOBILE_NAV_ITEMS, NAV_ITEMS } from "@/config/navigation";
import { isCurrentPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const OVERFLOW_ITEMS = NAV_ITEMS.filter((item) => !item.mobile);

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = !moreOpen && OVERFLOW_ITEMS.some((item) => isCurrentPath(pathname, item.href));

  return (
    <>
      <nav className="fixed bottom-3 inset-x-3 z-50 flex md:hidden rounded-pill border border-border-default bg-surface-base/92 px-2 py-2 backdrop-blur-xl shadow-panel-strong">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = isCurrentPath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-3 text-xs font-medium transition-colors",
                isActive ? "bg-accent-muted text-text-primary" : "text-text-muted hover:text-text-secondary",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "relative flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-3 text-xs font-medium transition-colors",
            isMoreActive || moreOpen ? "bg-accent-muted text-text-primary" : "text-text-muted hover:text-text-secondary",
          )}
          aria-expanded={moreOpen}
          aria-label="More navigation"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {/* Bottom sheet — all views not in the main tab bar */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/48 backdrop-blur-sm md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl border-t border-border-default bg-surface-base shadow-panel-strong md:hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <span className="text-sm font-semibold text-text-primary">All views</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-xl p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 px-3 pb-10">
              {OVERFLOW_ITEMS.map((item) => {
                const isActive = isCurrentPath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-accent-muted text-text-primary"
                        : "text-text-secondary hover:bg-surface-raised hover:text-text-primary",
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
