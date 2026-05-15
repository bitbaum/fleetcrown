import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Thin edge-safe middleware using the JWT-only config.
// Full auth (DB adapter + crypto) stays in src/auth.ts for server components.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect only app routes. Root "/" and all listed prefixes are public.
  // Use (.+) instead of (.*) so the root "/" (zero chars after slash) is never caught.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-out|beacon|thoughts|invite|whitepaper|setup|u/).+)",
  ],
};
