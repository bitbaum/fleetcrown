"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, MessageSquare, SlidersHorizontal, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollAffordance } from "@/components/ui/scroll-affordance";
import { FLEET_SURFACES } from "@/config/navigation";
import {
  FLEET_PROJECT_EVENT,
  fleetSurfaceHref,
  projectFromFleetRoute,
  readRememberedFleetProject,
  rememberFleetProject,
  type FleetSurfaceId,
} from "@/lib/fleet-context";

const ICONS = {
  profile: FolderKanban,
  chat: MessageSquare,
  control: SlidersHorizontal,
  terminal: SquareTerminal,
} satisfies Record<FleetSurfaceId, typeof MessageSquare>;

function subscribeToFleetProject(onStoreChange: () => void) {
  window.addEventListener(FLEET_PROJECT_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(FLEET_PROJECT_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * Profile, Chat, Control, and Terminal are views of one project workspace.
 * Moving between them preserves the active project.
 */
export function FleetSurfaceGuide() {
  const pathname = usePathname();
  const isProjectProfile = pathname.startsWith("/projects/");
  const currentIndex = FLEET_SURFACES.findIndex((s) =>
    s.id === "profile"
      ? isProjectProfile
      : pathname === s.href || pathname.startsWith(`${s.href}/`),
  );
  const readProject = useCallback(() => {
    const routeProject = projectFromFleetRoute(pathname, new URLSearchParams(window.location.search));
    return routeProject ?? readRememberedFleetProject();
  }, [pathname]);
  const project = useSyncExternalStore(subscribeToFleetProject, readProject, () => null);

  useEffect(() => {
    const routeProject = projectFromFleetRoute(pathname, new URLSearchParams(window.location.search));
    if (routeProject) rememberFleetProject(routeProject);
  }, [pathname]);

  if (currentIndex === -1) return null;

  return (
    <nav
      aria-label="Project workspace views"
      className="mx-3 mt-2 max-w-6xl shrink-0 sm:mx-4 xl:mx-auto xl:w-full"
    >
      <ScrollAffordance childCount={FLEET_SURFACES.length} threshold={4}>
        <div className="flex max-w-full items-center gap-2 overflow-x-auto ui-scroll-fade-right pb-1 pr-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:pr-0">
          <div className="inline-flex shrink-0 items-center rounded-lg border border-border-subtle bg-surface-base p-1">
            {FLEET_SURFACES.map((s, i) => {
              const active = i === currentIndex;
              const Icon = ICONS[s.id];
              return (
                <Link
                  key={s.href}
                  href={fleetSurfaceHref(s.id, project)}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors sm:min-h-8 sm:min-w-0 sm:px-3",
                    active
                      ? "bg-surface-raised text-text-primary shadow-sm"
                      : "text-text-tertiary hover:text-text-secondary",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-3.5 w-3.5 max-[350px]:hidden" aria-hidden="true" />
                  {s.label}
                </Link>
              );
            })}
          </div>
          {project && (
            <span className="shrink-0 text-xs text-text-secondary" title={project}>
              {project}
            </span>
          )}
        </div>
      </ScrollAffordance>
    </nav>
  );
}
