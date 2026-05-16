import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // Protect all app routes; exclude auth pages, public pages, static assets, and public API endpoints.
    "/((?!_next/static|_next/image|favicon.ico|sign-in|sign-out|sign-up|forgot-password|reset-password|invite|setup|whitepaper|u/|api/auth|api/stripe|api/checkout|api/invitations|api/health|api/beacon).*)",
  ],
};
