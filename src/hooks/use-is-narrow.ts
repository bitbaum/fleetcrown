"use client";

import { useEffect, useState } from "react";

/** Tailwind's `md` breakpoint, as a query. Below it the terminal shows its
 *  phone chrome; the CSS uses the same boundary via `md:` so the two never
 *  disagree about which layout is on screen. */
export const NARROW_QUERY = "(max-width: 767px)";

/**
 * Is this a phone-width viewport?
 *
 * The layout itself is done in CSS (`md:hidden` / `hidden md:block`), so this
 * exists only for what CSS cannot express: a *default* that differs by device
 * (live keystrokes — sensible on a laptop, wrong on a phone) and behaviour that
 * has to change rather than merely be hidden.
 *
 * Measured in the state initialiser, not in an effect, and that is load-bearing
 * rather than a micro-optimisation. The terminal keys its xterm connect effect
 * on `interactive`, which this value decides; correcting from false to true one
 * render later would tear the stream down and rebuild it on every phone page
 * load. It is safe to do here because nothing rendered on the server depends on
 * it — the markup is identical either way, so hydration has nothing to mismatch.
 */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return narrow;
}
