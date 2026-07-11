"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FLEET_SURFACES } from "@/config/navigation";

/**
 * A calm one-line map of the four surfaces that all touch "projects + agents"
 * (Projects, Loki, Control, Terminal). Users repeatedly asked which to use when;
 * showing all four with a one-word job and highlighting the current one makes
 * the relationship visible from any of them — and doubles as quick cross-nav
 * (the hand-off links between these surfaces already exist; this names the map).
 *
 * Renders ONLY while on one of the four surfaces, so it never clutters the rest
 * of the app. Wired once in AppShell — no per-page integration to drift.
 */
export function FleetSurfaceGuide() {
  const pathname = usePathname();
  const currentIndex = FLEET_SURFACES.findIndex((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
  if (currentIndex === -1) return null;

  return (
    <nav
      aria-label="Fleet surfaces"
      className="mx-3 -mb-1 mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-text-tertiary sm:mx-4"
    >
      {FLEET_SURFACES.map((s, i) => {
        const active = i === currentIndex;
        return (
          <span key={s.href} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-muted" aria-hidden="true">·</span>}
            <Link
              href={s.href}
              className={cn(
                "rounded px-1 py-0.5 transition-colors",
                active
                  ? "font-medium text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
              aria-current={active ? "page" : undefined}
            >
              {s.label}
              {active && <span className="font-normal text-text-tertiary"> — {s.role}</span>}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
