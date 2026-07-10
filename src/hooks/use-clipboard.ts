"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FEEDBACK_SHORT_MS } from "@/lib/constants/timings";

/**
 * One-shot "copy to clipboard + show a checkmark" hook — the SSOT for the
 * copy/reset pattern that was re-rolled inline across a dozen components.
 *
 * `copy(text)` writes to the clipboard and flips `copied` true, then resets it
 * to false after `resetMs` (default: FEEDBACK_SHORT_MS). The reset timer is
 * held in a ref and cleared on unmount / re-copy, so it never leaks or calls
 * setState after the component is gone. Clipboard write failures are swallowed
 * (insecure origins, denied permission) — the source text stays selectable, so
 * a failed copy is non-blocking; `copied` simply won't flip.
 *
 *   const { copied, copy } = useClipboard();
 *   <button onClick={() => copy(text)}>{copied ? "Copied" : "Copy"}</button>
 */
export function useClipboard(resetMs: number = FEEDBACK_SHORT_MS) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const copy = useCallback(
    (text: string) => {
      void Promise.resolve(navigator.clipboard?.writeText(text))
        .then(() => {
          setCopied(true);
          clearTimer();
          timerRef.current = setTimeout(() => setCopied(false), resetMs);
        })
        .catch(() => {
          // Clipboard API can fail on insecure origins or when permission is
          // denied; leave `copied` false and let the user fall back to manual
          // select-all.
        });
    },
    [resetMs],
  );

  return { copied, copy };
}
