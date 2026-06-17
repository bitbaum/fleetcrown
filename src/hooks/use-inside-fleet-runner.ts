"use client";

import { useEffect, useState } from "react";
import "@/components/desktop/types"; // declare global window.fleetRunner

/** True when the React tree is running inside the Fleet Runner desktop shell
 *  (Electron's preload injects `window.fleetRunner`). SSOT for the detection
 *  that several control/settings surfaces previously re-implemented inline.
 *
 *  Starts false and flips in an effect: `window` is undefined during the RSC
 *  pre-render, and a lazy `useState` initializer is locked into the RSC payload
 *  at hydration — so it can never observe the browser. The post-hydration
 *  effect is the React-sanctioned way to read a browser-only global without a
 *  hydration mismatch. For server components, use `isFleetRunnerRequest()` from
 *  `@/lib/fleet-runner` instead (flash-free, UA-based). */
export function useInsideFleetRunner(): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only global, see above
    setInside(typeof window !== "undefined" && !!window.fleetRunner);
  }, []);
  return inside;
}
