"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/config/navigation";
import { isCurrentPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The page <h1>. On mobile the AppTopBar already renders the current nav
 * label (e.g. "Control"), so a page whose title IS that label would show it
 * twice — a wasted line at the top of every nav page on the most space-
 * constrained viewport. Hide the h1 on mobile ONLY when it duplicates the top
 * bar's label; detail/flow pages (e.g. "Start a new project", an essay title)
 * keep their h1 because the top bar shows the parent label, not their title.
 */
export function PageTitle({ title }: { title: string }) {
  const pathname = usePathname();
  const navLabel = NAV_ITEMS.find((item) => isCurrentPath(pathname, item.href))?.label;
  const duplicatesTopBar = navLabel === title;
  return <h1 className={cn("ui-page-title", duplicatesTopBar && "hidden md:block")}>{title}</h1>;
}
