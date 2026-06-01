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

// ─── Public marketing nav — grouped for the desktop mega-menu and the
// mobile drawer. Each item carries a one-line description that surfaces in
// the dropdown panel so visitors know what's behind each link.

export type PublicNavItem = NavLink & { description: string };
export type PublicNavGroup = { label: string; items: PublicNavItem[] };

export const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  {
    label: "Product",
    items: [
      { label: "Mission",    href: "/mission",    description: "Why we exist" },
      { label: "Philosophy", href: "/philosophy", description: "Principles we build by" },
      { label: "Roadmap",    href: "/roadmap",    description: "Where we are going" },
      { label: "Whitepaper", href: "/whitepaper", description: "Technical architecture" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Investors", href: "/investors", description: "For investors" },
      { label: "Thoughts",  href: "/thoughts",  description: "Essays on architecture and systems" },
    ],
  },
];

// Flat list — kept for backwards compatibility (mobile fallbacks, sitemap-like
// uses). Derived from PUBLIC_NAV_GROUPS so the two never drift.
export const PUBLIC_NAV_LINKS: NavLink[] = PUBLIC_NAV_GROUPS.flatMap((g) =>
  g.items.map(({ label, href }) => ({ label, href })),
);
