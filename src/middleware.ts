import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Thin edge-safe middleware using the JWT-only config.
// Full auth (DB adapter + crypto) stays in src/auth.ts for server components.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Exclude public routes and Next.js internals from the auth middleware.
  // sign-in/sign-out/beacon/thoughts/invite are public — no auth required.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-out|beacon|thoughts|invite).*)",
  ],
};
