"use client";

import { useState, useEffect } from "react";
import { AskLokiModal } from "./AskLokiModal";

export function AskLokiButton() {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState("");

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (open) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPrefill("");
        setOpen(true);
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [open]);

  useEffect(() => {
    const eventHandler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt: string }>).detail?.prompt ?? "";
      setPrefill(prompt);
      setOpen(true);
    };
    window.addEventListener("loki:open", eventHandler);
    return () => window.removeEventListener("loki:open", eventHandler);
  }, []);

  return (
    <>
      <button
        onClick={() => { setPrefill(""); setOpen(true); }}
        className="ui-fab fixed bottom-7 right-7 z-40 hidden h-14 w-14 items-center justify-center text-xl active:scale-95 md:flex focus-visible:ring-2 focus-visible:ring-accent-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        title="Ask Loki (press ?)"
      >
        🌿
      </button>

      {open && <AskLokiModal onClose={() => setOpen(false)} initialInput={prefill} />}
    </>
  );
}
