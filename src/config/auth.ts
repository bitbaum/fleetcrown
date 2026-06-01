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

// Nav links shared by landing page and all auth pages
export const PUBLIC_NAV_LINKS: NavLink[] = [
  { label: "Roadmap", href: "/roadmap" },
  { label: "Investors", href: "/investors" },
  { label: "Philosophy", href: "/philosophy" },
  { label: "Mission", href: "/mission" },
  { label: "Whitepaper", href: "/whitepaper" },
];
