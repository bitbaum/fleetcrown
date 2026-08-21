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
  },
  dark: {
    /** --surface-page (dark) ≈ oklch(0.07 0 0), and exactly --surface-terminal —
     *  OG canvas, themeColor, xterm background */
    surfacePage: "#0a0a0a",
    /** --text-primary (dark) ≈ oklch(0.92 0 0) — OG text, brand-mark default stroke */
    textPrimary: "#ededed",
  },
  /** Approximate dark-token fallbacks used only when a CSS var cannot be
   *  resolved at runtime (MermaidDiagram's SSR guard). Slightly off from the
   *  canonical mirrors above — kept verbatim so no rendered value changes. */
  darkFallback: {
    /** ≈ --surface-base (dark) */
    surfaceBase: "#0d0d0d",
    /** ≈ --surface-raised (dark) */
    surfaceRaised: "#1e1e1e",
    /** ≈ --text-primary (dark) */
    textPrimary: "#e8e8e8",
    /** ≈ --text-tertiary (dark) */
    textTertiary: "#666666",
  },
  /** Approximate light-token fallbacks for Mermaid when CSS vars cannot resolve. */
  lightFallback: {
    /** ≈ --surface-base (light) */
    surfaceBase: "#f7f7f7",
    /** ≈ --surface-raised (light) */
    surfaceRaised: "#ffffff",
    /** ≈ --text-primary (light) */
    textPrimary: "#171717",
    /** ≈ --text-tertiary (light) */
    textTertiary: "#737373",
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
} as const;
