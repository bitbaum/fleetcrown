// JS mirrors of globals.css design tokens for contexts that cannot read CSS
// vars (satori OG images, email HTML, Next metadata themeColor, xterm).
// If you change a value here, change the token in src/app/globals.css and
// vice versa — grep the token name. The zinc/gray groups are Tailwind-scale
// greys used only on these framework surfaces (they have no globals.css
// counterpart). Every hex value in this file appears exactly once; consumers
// import the constant instead of re-declaring the literal.

export const PALETTE = {
  light: {
    /** --surface-page (light) ≈ oklch(0.97 0 0) — browser-chrome themeColor */
    surfacePage: "#f7f7f7",
    /** --status-negative (light) ≈ oklch(0.50 0.18 25) — digest-email alert stat */
    statusNegative: "#b32228",
    /** --status-positive (light) ≈ oklch(0.44 0.16 145) — digest-email shipped stat */
    statusPositive: "#006700",
  },
  dark: {
    /** --surface-page (dark) ≈ oklch(0.07 0 0), and exactly --surface-terminal —
     *  OG canvas, themeColor, xterm background */
    surfacePage: "#0a0a0a",
    /** --text-primary (dark) ≈ oklch(0.92 0 0) — OG text, brand-mark default stroke */
    textPrimary: "#ededed",
    /** ≈ --text-tertiary (dark) — digest-email muted text */
    textTertiary: "#666666",
  },
  /** Tailwind zinc-scale mirrors — OG-card greys and xterm. Email chrome
   *  lives in EMAIL_THEME (src/config/comms.ts) and maps to brand tokens. */
  zinc: {
    /** zinc-100 — email body background */
    100: "#f4f4f5",
    /** zinc-200 — terminal foreground + cursor */
    200: "#e4e4e7",
    /** zinc-400 — OG secondary text */
    400: "#a1a1aa",
    /** zinc-500 — email footer text */
    500: "#71717a",
    /** zinc-600 — OG separator dots */
    600: "#52525b",
    /** zinc-700 — OG tag border, terminal selection background */
    700: "#3f3f46",
    /** zinc-950 — email header background, headings, strong text */
    950: "#09090b",
  },
  /** Tailwind gray-scale mirrors — email body copy + OG avatar fill. */
  gray: {
    /** gray-400 — email small print */
    400: "#9ca3af",
    /** gray-500 — email fallback links */
    500: "#6b7280",
    /** gray-700 — email paragraphs */
    700: "#374151",
    /** gray-800 — OG initials-avatar background */
    800: "#1f2937",
  },
  /** Plain white — email card surface + button/header text on dark fills. */
  white: "#ffffff",
  /** Widget theme — mirrors the app's dark-mode design tokens for the embed.
   *  The widget is always dark (works on any host page background), so these
   *  map to .dark tokens in globals.css. Change both places together. */
  widget: {
    /** --accent-warm (dark) ≈ oklch(0.69 0.21 41) — the ONE accent: send, focus, selection */
    accent: "#ff7519",
    /** --accent-warm-hover (dark) ≈ oklch(0.75 0.19 43) */
    accentHover: "#ff8534",
    /** accent over the dark surface at ~10% — hint rows, recording state */
    accentMuted: "#2b1a10",
    /** --on-accent — dark ink on the warm orange; white fails contrast there */
    inkOnAccent: "#0a0a0a",
    /** --text-primary (dark) ≈ oklch(0.92 0 0) */
    text: "#ededed",
    /** --text-secondary (dark) ≈ oklch(0.6 0 0) */
    textSecondary: "#9a9a9a",
    /** --text-tertiary (dark) ≈ oklch(0.4 0 0) */
    textTertiary: "#666666",
    /** placeholders, counters, key hints */
    textMuted: "#595959",
    /** --surface-public — the near-black FleetCrown's own pages sit on */
    surface: "#0a0a0a",
    /** inputs and the segmented control's track */
    surfaceRaised: "#141414",
    /** hover fill for quiet buttons */
    surfaceSubtle: "#1c1c1c",
    /** --border-subtle (dark) */
    border: "#262626",
    /** --border-default (dark) */
    borderStrong: "#3a3a3a",
    /** launcher and picker-bar edge, which sit on unknown host backgrounds */
    borderDark: "#4a4a4a",
    /** --status-positive (dark) */
    success: "#22a06b",
    /** --status-negative (dark) */
    error: "#ff6b57",
    /** error over the dark surface */
    errorSurface: "#2a1414",
    black: "#0a0a0a",
    white: "#ffffff",
  },
} as const;
