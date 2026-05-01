"use client";

import { useState } from "react";
import { AskIvyModal } from "./AskIvyModal";

export function AskIvyButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ui-fab fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center text-xl active:scale-95 md:bottom-7 md:right-7 focus-visible:ring-2 focus-visible:ring-accent-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        title="Ask Ivy"
      >
        🌿
      </button>

      {open && <AskIvyModal onClose={() => setOpen(false)} />}
    </>
  );
}
