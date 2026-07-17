import type { ITheme } from "@xterm/xterm";
import { PALETTE } from "@/lib/palette";

// SSOT for the embedded terminal's colors. The base surface/text colors come
// from src/lib/palette.ts (the JS mirror of globals.css tokens — xterm can't
// read CSS vars). The ANSI-16 set below is intentionally local: it's a
// standard terminal palette, NOT a set of brand design tokens — a terminal's
// "red" must read as red regardless of theme. Tuned to a near-black, low-glare
// dark scheme that sits next to the public surface.

// xterm-specific ANSI-16 colors (normal + bright). Terminal semantics, not
// design tokens — do not move these into palette.ts.
const ANSI_16 = {
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
} as const;

export const TERMINAL_THEME: ITheme = {
  // MUST equal --surface-terminal in src/app/globals.css; PALETTE.dark.surfacePage
  // is the JS mirror of that token.
  background: PALETTE.dark.surfacePage,
  foreground: PALETTE.zinc[200],
  cursor: PALETTE.zinc[200],
  cursorAccent: PALETTE.dark.surfacePage,
  selectionBackground: PALETTE.zinc[700],
  ...ANSI_16,
};
