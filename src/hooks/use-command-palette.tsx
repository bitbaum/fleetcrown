"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type CommandPaletteApi = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteApi | null>(null);

/** Build the API once in AppShell, then pass it to the Provider. */
export function useCommandPaletteState(): CommandPaletteApi {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((s) => !s), []);
  return useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
}

export function CommandPaletteProvider({
  value,
  children,
}: {
  value: CommandPaletteApi;
  children: React.ReactNode;
}) {
  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

/** Any descendant of CommandPaletteProvider can open/close/toggle the palette. */
export function useCommandPalette(): CommandPaletteApi {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return ctx;
}

/** Cmd-K (mac) / Ctrl-K (win/linux) opens the palette globally. "/" also
 *  opens it, unless an input/textarea/contentEditable currently has focus. */
export function useCommandPaletteHotkey(api: CommandPaletteApi): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (cmdK) {
        e.preventDefault();
        api.toggle();
        return;
      }
      // composedPath()[0] is the true innermost target even when the event
      // originated inside a shadow root (e.g. an embedded widget's textarea),
      // where e.target is retargeted to the shadow host and the guard would
      // otherwise misread a text field as "not typing" and steal the keystroke.
      if (e.key === "/" && !isTypingTarget(e.composedPath()[0] ?? e.target)) {
        e.preventDefault();
        api.setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
