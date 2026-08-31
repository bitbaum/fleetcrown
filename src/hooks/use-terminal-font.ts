"use client";

import { useCallback, useRef } from "react";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { TERMINAL_MOBILE_MAX_FONT, TERMINAL_MOBILE_MIN_FONT } from "@/lib/terminal-viewport";

const FONT_SIZE_KEY = "fleetcrown:terminal-font-size";
const MAX_FONT = 24;

// Module scope so their identity is stable — useLocalStorageState keeps them in
// effect dependency arrays.
const serialize = (size: number | null) => (size === null ? "auto" : String(size));
/** Anything that is not a usable point size — "auto", a corrupted value, a size
 *  from a build with different bounds — means auto-fit. Note this also reads the
 *  plain `"14"` written by the previous implementation, so an operator's chosen
 *  size survives this refactor. */
const deserialize = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= TERMINAL_MOBILE_MIN_FONT && n <= MAX_FONT ? n : null;
};

export type TerminalFontControl = {
  /** null = auto-fit to TERMINAL_TARGET_COLS; a number is the operator's choice. */
  size: number | null;
  /** Step from the size currently rendered — the caller reports that back via
   *  `sync`, because in auto mode only the terminal knows what it settled on. */
  step: (delta: number) => void;
  reset: () => void;
  /** The live rendered size, so a step from auto starts where the eye is. */
  sync: (rendered: number) => void;
};

/**
 * The terminal's font size, owned above the terminal.
 *
 * It used to live inside TerminalView with its stepper welded to the status
 * row. That was fine while the only place to change it was that row; it stopped
 * being fine when the phone's controls moved into a sheet, because the sheet
 * cannot reach into the view's state. Hoisting it here keeps one owner and lets
 * both the desktop status row and the mobile sheet drive the same value.
 *
 * On a phone size is really a column count in disguise (see TerminalView's
 * header comment): smaller font, more columns, output that matches the 80-column
 * screen the agent drew. So the stepper is labelled by consequence in the UI,
 * not by point size.
 */
export function useTerminalFont(): TerminalFontControl {
  const [size, setSize] = useLocalStorageState<number | null>(
    FONT_SIZE_KEY,
    null,
    serialize,
    deserialize,
  );
  // A ref, not state: the rendered size is only ever read at the moment someone
  // presses A−/A+, and re-rendering the whole terminal every time auto-fit
  // settles on a pixel would be a cost paid for nothing.
  const rendered = useRef(TERMINAL_MOBILE_MAX_FONT);

  const step = useCallback(
    (delta: number) => {
      setSize((current) => {
        const base = current ?? rendered.current;
        return Math.min(MAX_FONT, Math.max(TERMINAL_MOBILE_MIN_FONT, base + delta));
      });
    },
    [setSize],
  );

  const reset = useCallback(() => setSize(null), [setSize]);

  const sync = useCallback((px: number) => {
    rendered.current = px;
  }, []);

  return { size, step, reset, sync };
}
