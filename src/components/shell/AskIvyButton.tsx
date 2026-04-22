"use client";

import { useState } from "react";
import { AskIvyModal } from "./AskIvyModal";

export function AskIvyButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 h-12 w-12 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg shadow-emerald-900/30 flex items-center justify-center text-xl transition-all"
        title="Ask Ivy"
      >
        🌿
      </button>

      {open && <AskIvyModal onClose={() => setOpen(false)} />}
    </>
  );
}
