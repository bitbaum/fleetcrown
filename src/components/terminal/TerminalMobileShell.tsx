"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BODY_CLASS = "fc-terminal-fullscreen";

/**
 * Mobile-only expand/collapse for /terminal. Normal layout keeps the page in
 * app-viewport-pane (top bar + bottom nav). Expanded mode covers the full
 * screen so xterm gets usable height and the soft keyboard doesn't crush it.
 *
 * This component used to own a header row too: a sentence explaining that the
 * default pane is too small on phones, next to the Expand button. Telling the
 * operator the layout is bad, in the space that made it bad, is not a fix — the
 * row is gone and the toggle now lives in TerminalMobileBar alongside the other
 * controls, which is also where a thumb already is.
 */
export function TerminalMobileShell({
  children,
}: {
  children: (opts: { immersive: boolean; toggleImmersive: () => void }) => React.ReactNode;
}) {
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    if (!immersive) {
      document.body.classList.remove(BODY_CLASS);
      return;
    }
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, [immersive]);

  const toggleImmersive = useCallback(() => setImmersive((v) => !v), []);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col md:gap-3",
        immersive && "ui-term-mobile-fullscreen",
      )}
    >
      {children({ immersive, toggleImmersive })}
    </div>
  );
}
