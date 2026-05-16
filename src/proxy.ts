import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Thin edge-safe middleware using the JWT-only config.
// Full auth (DB adapter + crypto) stays in src/auth.ts for server components.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect only app routes. Root "/" and all listed prefixes are public.
  // Use (.+) instead of (.*) so the root "/" (zero chars after slash) is never caught.
  // All api/ routes handle their own auth — exclude them entirely from the middleware.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-out|sign-up|forgot-password|reset-password|beacon|thoughts|invite|whitepaper|setup|u/).+)",
  ],
};
