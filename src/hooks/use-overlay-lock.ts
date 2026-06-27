"use client";

import { useEffect } from "react";

const BODY_CLASS = "fc-overlay-open";

/** Hide mobile chrome and lock scroll while a modal/drawer covers the app. */
export function useOverlayLock(active = true) {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, [active]);
}
