"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { MOBILE_NAV_ITEMS, NAV_ITEMS } from "@/config/navigation";
import { isCurrentPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const OVERFLOW_ITEMS = NAV_ITEMS.filter((item) => !item.mobile);

function openAskIvy() {
  window.dispatchEvent(new CustomEvent("ivy:open", { detail: { prompt: "" } }));
}

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = !moreOpen && OVERFLOW_ITEMS.some((item) => isCurrentPath(pathname, item.href));

  return (
    <>
      <nav className="ui-mobile-nav" aria-label="Primary">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = isCurrentPath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "ui-mobile-nav-item",
                isActive ? "ui-mobile-nav-item-active" : "ui-mobile-nav-item-idle",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </Link>
          );
        })}

        <div className="ui-mobile-nav-ivy">
          <button
            type="button"
            onClick={openAskIvy}
            className="ui-mobile-nav-ivy-btn"
            aria-label="Ask Ivy"
            title="Ask Ivy"
          >
            🌿
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "ui-mobile-nav-item",
            isMoreActive || moreOpen ? "ui-mobile-nav-item-active" : "ui-mobile-nav-item-idle",
          )}
          aria-expanded={moreOpen}
          aria-label="More navigation"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/48 backdrop-blur-sm md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="ui-mobile-nav-sheet">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <span className="text-sm font-semibold text-text-primary">All views</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-xl p-3 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 px-3">
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
