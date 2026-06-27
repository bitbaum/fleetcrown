"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BODY_CLASS = "fc-terminal-fullscreen";

/**
 * Mobile-only expand/collapse for /terminal. Normal layout keeps the page in
 * app-viewport-pane (top bar + bottom nav). Expanded mode covers the full
 * screen so xterm gets usable height and the soft keyboard doesn't crush it.
 */
export function TerminalMobileShell({
  children,
}: {
  children: (opts: { immersive: boolean }) => React.ReactNode;
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

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 md:gap-3",
        immersive && "ui-term-mobile-fullscreen",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 md:hidden">
        {!immersive && (
          <p className="min-w-0 flex-1 text-xs leading-snug text-text-muted">
            Expand for full-screen typing — the default pane is too small on phones.
          </p>
        )}
        {immersive && (
          <span className="ui-micro-label flex-1">Full screen</span>
        )}
        <button
          type="button"
          className="ui-btn-chip min-h-11 shrink-0 gap-1.5 px-3"
          onClick={() => setImmersive((v) => !v)}
          aria-pressed={immersive}
          aria-label={immersive ? "Exit full screen terminal" : "Expand terminal to full screen"}
        >
          {immersive ? (
            <>
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
              Collapse
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              Expand
            </>
          )}
        </button>
      </div>
      <div className="min-h-0 flex-1">{children({ immersive })}</div>
    </div>
  );
}
