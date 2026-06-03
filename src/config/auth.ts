import type { NavLink } from "@/components/public/PublicSurface";

// Single source of truth for all auth and app route strings.
// Import from here — never hardcode "/sign-in" or "/today" in components.
export const ROUTES = {
  // Public app
  HOME: "/",
  // Auth
  SIGN_IN: "/sign-in",
  SIGN_UP: "/sign-up",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  VERIFY_EMAIL: "/verify-email",
  ONBOARDING: "/onboarding",
  SIGN_OUT: "/sign-out",
  // Post-auth default
  APP_HOME: "/today",
} as const;

// ─── Public marketing nav — platform-wide content only.
//
// A deliberate architectural boundary lives here: every entry must apply to
// the whole platform, not to a single user. Per-user surfaces (the user's
// own Thoughts, profile, etc.) live in the in-app sidebar and on user
// profile routes (/u/<username>/...), never in the public marketing nav —
// even when the founder's own essays happen to discuss the platform.
//
// Three shapes:
//   - "menu" → dropdown with items + descriptions (mega-menu)
//   - "link" → single direct link in the top nav
//   - "external" → link to another origin (sibling product, etc.)
//                  Rendered with an explicit external-target indicator so
//                  visitors know they are leaving fleetcrown.vercel.app.
// The shape is per-entry so we never paint a one-item dropdown.

export type PublicNavItem = NavLink & { description: string };
export type PublicNavEntry =
  | { kind: "menu"; label: string; items: PublicNavItem[] }
  | { kind: "link"; label: string; href: string }
  | { kind: "external"; label: string; href: string; description?: string };

export const PUBLIC_NAV: PublicNavEntry[] = [
  {
    kind: "menu",
    label: "Products",
    items: [
      { label: "Fleet control", href: "/",         description: "Web command center for agent operations" },
      { label: "Fleet Runner",  href: "/download", description: "Local desktop execution layer" },
      { label: "Roadmap",       href: "/roadmap",  description: "Desktop, mobile, teams, and robotics" },
    ],
  },
  {
    kind: "menu",
    label: "Developers",
    items: [
      { label: "Download",    href: "/download",   description: "Build or install the local runner" },
      { label: "Whitepaper",  href: "/whitepaper", description: "Architecture and control-plane details" },
      { label: "Thoughts",    href: "/thoughts",   description: "Technical essays and product thinking" },
    ],
  },
  {
    kind: "menu",
    label: "Company",
    items: [
      { label: "Mission",    href: "/mission",    description: "Why FleetCrown exists" },
      { label: "Philosophy", href: "/philosophy", description: "Principles we build by" },
      { label: "Investors",  href: "/investors",  description: "The market and operating thesis" },
    ],
  },
  {
    kind: "external",
    label: "OrangeCat",
    href: "https://orangecat.ch",
    description: "Sibling product — the transaction half of the techno-capital machine for individuals. FleetCrown is the production half; OrangeCat is the economic half. See the Thoughts essay The Two Halves of the Individual Singularity for the joint architecture.",
  },
];

// Flat list — kept for backwards compatibility (sitemap-like uses, mobile
// fallbacks). Derived from PUBLIC_NAV so the two never drift.
export const PUBLIC_NAV_LINKS: NavLink[] = PUBLIC_NAV.flatMap((entry) =>
  entry.kind === "menu"
    ? entry.items.map(({ label, href }) => ({ label, href }))
    : [{ label: entry.label, href: entry.href }],
);
