"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounts a setInterval that calls router.refresh() so server-component cards
 * on the page stay fresh without manual gestures. Visibility-gated — won't
 * poll while the tab is hidden (saves bandwidth on a backgrounded tab).
 *
 * Use case: /system's RecentFailuresCard reads debug_logs server-side once
 * per render. A failure that lands NOW is invisible until the user gestures
 * a refresh. Mount <AutoRefresh /> next to the card to close that window.
 *
 * Stateless. Renders null. Composable with PullToRefresh + RefreshOnFocus —
 * each is its own trigger; they don't fight (router.refresh is idempotent
 * if called multiple times in quick succession; Next batches the work).
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, router]);
  return null;
}
