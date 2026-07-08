import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe auth middleware — uses only the JWT session and the authorized()
// callback from auth.config.ts. No DB adapter, no Node.js crypto.
//
// What this activates:
//   • Unauthenticated users → redirect to /sign-in with callbackUrl
//   • Authenticated + onboarding incomplete → redirect to /onboarding
//   • Runner bearer-token requests → pass through to individual routes
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
     *   download                    – public install/discovery page
     *   whitepaper, thoughts       – public content
     *   frontier                   – daily AI/robotics frontier digest (public)
     *   mission, philosophy,       – public marketing pages
     *   investors, roadmap, pricing
     *   u/                         – public user profiles (/u/[username])
     *   share/project/             – unlisted read-only project dossiers
     *   beacon                     – public beacon page
     *   api/auth                   – NextAuth internal endpoints
     *   api/agent/install          – serves the @fleetcrown/agent CLI for curl|node install
     *                                (public so new customers can run it before they sign in)
     *   api/agent/daemon           – serves the gzipped daemon-scripts tarball for the
     *                                CLI's install step (same pre-auth rationale as /install)
     *   api/health, api/setup      – infrastructure endpoints (pre-auth)
     *   api/crons, api/system      – GET excluded for runner/monitoring; write methods enforce auth in-handler
     *   api/invitations/           – token-scoped invitation routes (GET validate, POST accept);
     *                                trailing slash keeps GET /api/invitations (list) protected
     *   api/stripe/webhook         – Stripe webhook; verifies its own Stripe-Signature header
     *   import-from-local\.sh      – public bash one-liner users curl-pipe into their terminal
     *                                to scan ~/dev and POST detected repos to /api/projects/import-from-local
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|manifest\\.json|opengraph-image|twitter-image|robots\\.txt|sitemap\\.xml|sign-in|sign-up|forgot-password|reset-password|verify-email|setup|invite|download|whitepaper|thoughts|frontier|mission|philosophy|investors|roadmap|pricing|releases|privacy|terms|license|docs/quickstart|u/|share/project/|beacon|import-from-local\\.sh|api/auth|api/agent/install|api/agent/daemon|api/health|api/setup|api/crons|api/system|api/beacon|api/invitations/|api/stripe/webhook).+)",
  ],
};
