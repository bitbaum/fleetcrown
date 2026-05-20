import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe auth middleware — uses only the JWT session and the authorized()
// callback from auth.config.ts. No DB adapter, no Node.js crypto.
//
// What this activates:
//   • Unauthenticated users → redirect to /sign-in with callbackUrl
//   • Authenticated + onboardedAt null → redirect to /onboarding
//   • Daemon bearer-token requests → pass through to individual routes
//
// The matcher intentionally excludes public routes so they stay accessible
// without a session. Protected pages that need a userId also call
// requirePageUserId() as a belt-and-suspenders check.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Run on every path EXCEPT:
     *   _next/static, _next/image  – Next.js internals
     *   favicon.ico                – browser icon request
     *   icon\.svg, manifest\.json  – PWA / browser-tab static assets
     *   opengraph-image, twitter-image – social card crawlers (FB, Twitter, Slack, LinkedIn)
     *   robots\.txt, sitemap\.xml  – search engines
     *   /                          – public landing page (.+ not .*)
     *   sign-in, sign-up           – public auth pages
     *   forgot-password, reset-password, verify-email, setup, invite
     *   whitepaper, thoughts       – public content
     *   u/                         – public user profiles (/u/[username])
     *   beacon                     – public beacon page
     *   api/auth                   – NextAuth internal endpoints
     *   api/health, api/setup      – infrastructure endpoints (pre-auth)
     *   api/crons, api/system      – GET excluded for daemon/monitoring; write methods enforce auth in-handler
     *   api/invitations/           – token-scoped invitation routes (GET validate, POST accept);
     *                                trailing slash keeps GET /api/invitations (list) protected
     *   api/stripe/webhook         – Stripe webhook; verifies its own Stripe-Signature header
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|manifest\\.json|opengraph-image|twitter-image|robots\\.txt|sitemap\\.xml|sign-in|sign-up|forgot-password|reset-password|verify-email|setup|invite|whitepaper|thoughts|u/|beacon|api/auth|api/health|api/setup|api/crons|api/system|api/beacon|api/invitations/|api/stripe/webhook).+)",
  ],
};
