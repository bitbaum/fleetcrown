"use client";

import { useState, useEffect } from "react";
import { AskIvyModal } from "./AskIvyModal";

export function AskIvyButton() {
  const [open, setOpen] = useState(false);

  // Global shortcut: ? opens Ivy from anywhere (skips inputs/textareas)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (open) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ui-fab fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center text-xl active:scale-95 md:bottom-7 md:right-7 focus-visible:ring-2 focus-visible:ring-accent-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        title="Ask Ivy (press ?)"
      >
        🌿
      </button>

      {open && <AskIvyModal onClose={() => setOpen(false)} />}
    </>
  );
}
