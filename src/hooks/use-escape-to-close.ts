"use client";

import { useEffect } from "react";

/**
 * Escape closes the overlay. One definition, so an overlay cannot be built
 * without it.
 *
 * This lived inside `components/ui/modal.tsx` as a private helper, which meant
 * the only way to get the behaviour was to use `<Modal>`/`<Drawer>`. Anything
 * that hand-rolled its own dialog — as the mobile navigation sheet did — got a
 * dialog you could open and not close with the keyboard, and nothing said so.
 */
export function useEscapeToClose(onClose: () => void, disabled = false) {
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, disabled]);
}
