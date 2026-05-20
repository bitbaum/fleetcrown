"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { COCKPIT_REFRESH_EVENT } from "@/lib/client-events";

/**
 * When the tab returns visible after ≥30s hidden, fire a router.refresh() +
 * cockpit:refresh broadcast so server-component data and every client-side
 * useFetch poll catch up in lockstep — same shape as PullToRefresh's commit
 * path, just triggered by tab-focus return instead of a finger gesture.
 *
 * The threshold suppresses spam from quick app switches (Cmd-Tab → glance →
 * Cmd-Tab back). 30s is the conservative floor: shorter than the longest
 * client-poll interval (10 min weather, 5 min calendar, 2 min GitHub, 30s
 * system) but long enough that "I was reading another tab for a bit" doesn't
 * trigger network churn.
 *
 * Mounted once in AppShell so every authenticated route benefits.
 */
const REFRESH_THRESHOLD_MS = 30_000;

export function RefreshOnFocus() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const wentHiddenAt = hiddenAt.current;
      hiddenAt.current = null;
      if (wentHiddenAt && Date.now() - wentHiddenAt >= REFRESH_THRESHOLD_MS) {
        router.refresh();
        window.dispatchEvent(new CustomEvent(COCKPIT_REFRESH_EVENT));
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [router]);

  return null;
}
