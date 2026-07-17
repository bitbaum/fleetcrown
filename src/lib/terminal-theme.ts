import type { ITheme } from "@xterm/xterm";

// SSOT for the embedded terminal's colors. This is a standard ANSI-16 terminal
// palette, NOT a set of brand design tokens — a terminal's "red" must read as
// red regardless of theme, so these intentionally live here (the documented
// exception, like Recharts/canvas) rather than as semantic CSS vars. Tuned to a
// near-black, low-glare dark scheme that sits next to the public surface.
export const TERMINAL_THEME: ITheme = {
  // MUST match --surface-terminal in src/app/globals.css (xterm needs a JS
  // literal here — it can't read CSS vars). Change both together.
  background: "#0a0a0a",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  cursorAccent: "#0a0a0a",
  selectionBackground: "#3f3f46",
  // Normal
  black: "#1c1917",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e4e4e7",
  // Bright
  brightBlack: "#57534e",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fcd34d",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};
