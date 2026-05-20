"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { haptic } from "@/lib/haptics";

/**
 * Mobile-only pull-to-refresh. Swipe-down past 80px at scrollTop=0 fires
 * router.refresh() — useful for status surfaces (/today, /control) where the
 * user wants to manually pull the latest server data without a hard reload.
 *
 * Wraps children with no layout impact: the indicator is a fixed-position
 * overlay that fades in as the user pulls, snaps back if the threshold isn't
 * reached, and locks at the threshold position during the actual refresh.
 *
 * Touch listeners are attached to `window` so the gesture works no matter
 * which scroll container the user starts from. Bails out cleanly on
 * non-touch devices — desktop users see nothing.
 */
const THRESHOLD = 80;
const DAMPING = 0.5;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    const scrollContainer = document.querySelector(".app-main") as HTMLElement | null;
    const getScrollTop = () =>
      scrollContainer ? scrollContainer.scrollTop : window.scrollY;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (getScrollTop() > 0) { startY.current = null; return; }
      startY.current = e.touches[0]!.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const dy = e.touches[0]!.clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      setPull(Math.min(dy * DAMPING, THRESHOLD * 1.5));
    };

    const onTouchEnd = () => {
      if (startY.current === null) { setPull(0); return; }
      const triggered = pullRef.current >= THRESHOLD;
      startY.current = null;
      if (triggered) {
        haptic(20);
        setRefreshing(true);
        setPull(THRESHOLD);
        router.refresh();
        // Hold the indicator briefly so the user sees the refresh, then snap back.
        setTimeout(() => {
          setRefreshing(false);
          setPull(0);
        }, 700);
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [refreshing, router]);

  const indicatorVisible = pull > 8;
  const armed = pull >= THRESHOLD;

  return (
    <>
      {indicatorVisible && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center md:hidden"
          style={{
            transform: `translateY(${Math.max(0, pull - 16)}px)`,
            opacity: Math.min(1, pull / THRESHOLD),
            transition: refreshing || pull === 0 ? "transform 200ms ease, opacity 200ms ease" : "none",
          }}
        >
          <div className="mt-2 rounded-full border border-border-subtle bg-surface-overlay p-2 shadow-panel">
            <RefreshCw
              className={`h-4 w-4 text-text-secondary ${refreshing || armed ? "animate-spin" : ""}`}
              style={refreshing || armed ? undefined : { transform: `rotate(${pull * 4}deg)` }}
            />
          </div>
        </div>
      )}
      {children}
    </>
  );
}
