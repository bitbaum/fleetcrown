import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Thin edge-safe middleware using the JWT-only config.
// Full auth (DB adapter + crypto) stays in src/auth.ts for server components.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Exclude public routes and Next.js internals from middleware.
  // sign-in must be excluded to avoid an infinite redirect loop for logged-out users.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sign-in).*)"],
};
