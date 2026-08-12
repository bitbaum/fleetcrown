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
//                  visitors know they are leaving fleetcrown.orangecat.ch.
// The shape is per-entry so we never paint a one-item dropdown.

export type PublicNavItem = NavLink & { description: string };
export type PublicNavSection = { title: string; items: PublicNavItem[] };
export type PublicNavEntry =
  | { kind: "menu"; label: string; sections: PublicNavSection[] }
  | { kind: "link"; label: string; href: string }
  | { kind: "external"; label: string; href: string; description?: string };

export const PUBLIC_NAV: PublicNavEntry[] = [
  {
    kind: "menu",
    label: "Product",
    sections: [
      {
        title: "Understand",
        items: [
          { label: "Mission", href: "/mission", description: "Why FleetCrown exists" },
          { label: "Philosophy", href: "/philosophy", description: "The principles behind the product" },
          { label: "Roadmap", href: "/roadmap", description: "What works now and what comes next" },
          { label: "Changelog", href: "/releases", description: "Every shipped release" },
          { label: "Docs", href: "/docs", description: "Install, connect, and operate your fleet" },
          { label: "Whitepaper", href: "/whitepaper", description: "Architecture and product thesis" },
        ],
      },
      {
        title: "Use",
        items: [
          { label: "Download", href: "/download", description: "Linux app, dependencies, and setup path" },
          { label: "Pricing", href: "/pricing", description: "Plans for operators and teams" },
          { label: "Frontier", href: "/frontier", description: "Daily AI & robotics frontier digest" },
        ],
      },
    ],
  },
  {
    // Label matches the destination page's own title ("Thoughts") — the old
    // "Blog" label landed on a page that never calls itself a blog. /blog now
    // redirects here so the canonical URL is the one the nav shows.
    kind: "link",
    label: "Thoughts",
    href: "/thoughts",
  },
  {
    kind: "link",
    label: "Support",
    href: "/support",
  },
  // Dropdown descriptions stay to one short sentence — the essay-length
  // context lives in the Thoughts essays, not in a hover.
  {
    kind: "external",
    label: "OrangeCat",
    href: "https://orangecat.ch",
    description: "The economic pillar of the stack — Bitcoin-native funding and public entities.",
  },
  {
    kind: "external",
    label: "Solon",
    href: "https://solon.orangecat.ch",
    description: "The governance pillar of the stack — Bitcoin-signed proposals and votes.",
  },
];

// Flat list — kept for backwards compatibility (sitemap-like uses, mobile
// fallbacks). Derived from PUBLIC_NAV so the two never drift.
export const PUBLIC_NAV_LINKS: NavLink[] = PUBLIC_NAV.flatMap((entry) =>
  entry.kind === "menu"
    ? entry.sections.flatMap((section) => section.items.map(({ label, href }) => ({ label, href })))
    : [{ label: entry.label, href: entry.href }],
);
