import type { NextAuthConfig } from "next-auth";
import { ROUTES } from "@/config/auth";

// Edge-safe auth config — no DB adapter, no Node.js crypto.
// Used by src/middleware.ts (Edge Runtime).
// Full auth with DB adapter lives in src/auth.ts.
export const authConfig = {
  session: { strategy: "jwt" } as const,
  pages: {
    signIn: ROUTES.SIGN_IN,
  },
  providers: [],
  callbacks: {
    // Propagate onboardedAt from the JWT payload so the authorized callback below
    // can gate unonboarded users to the /onboarding page without a DB lookup.
    // The jwt() callback in auth.ts stores this field on every sign-in/token refresh.
    session({ session, token }) {
      if (session.user) {
        session.user.onboardedAt = (token.onboardedAt as Date | null) ?? null;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname, search } = request.nextUrl;

      // Invitation token routes must be publicly accessible so unauthenticated
      // users can accept team invitations. startsWith is used rather than a
      // regex because the edge runtime's regex engine does not reliably evaluate
      // complex lookahead patterns at compile time.
      if (pathname.startsWith("/api/invitations/")) return true;

      if (!auth?.user) {
        // Bearer-authenticated requests (ck_* agent tokens preferred; legacy
        // daemon env token honored only when explicitly opted in). Individual
        // routes enforce the real auth check via getApiUserId/getBearerUserId.
        const authHeader = request.headers.get("authorization") ?? "";
        if (authHeader.startsWith("Bearer ck_")) return true;
        // Edge runtime — inline the alias logic instead of importing to keep the bundle tiny.
        const daemonToken = process.env.APP_DAEMON_TOKEN ?? process.env.COCKPIT_DAEMON_TOKEN;
        const legacyAllowed = (process.env.APP_ALLOW_LEGACY_DAEMON_TOKEN ?? process.env.COCKPIT_ALLOW_LEGACY_DAEMON_TOKEN) === "1";
        if (legacyAllowed && daemonToken && authHeader === `Bearer ${daemonToken}`) return true;

        // On Vercel, the Edge Runtime sees the deployment URL (cockpit-orangecat.vercel.app)
        // not the custom alias. x-forwarded-host carries the real host the user typed.
        const host =
          request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
        const proto =
          request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
        const signInUrl = new URL(ROUTES.SIGN_IN, `${proto}://${host}`);
        if (pathname !== ROUTES.SIGN_IN) {
          signInUrl.searchParams.set("callbackUrl", pathname + search);
        }
        // API routes must not redirect — callers expect JSON 401.
        if (pathname.startsWith("/api/")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.redirect(signInUrl);
      }

      // Redirect authenticated-but-not-onboarded users to the onboarding flow.
      // API routes are excluded so onboarding page API calls (/api/me, /api/user-projects)
      // work normally. Sign-out is excluded to avoid a redirect loop on logout.
      if (
        !auth.user.onboardedAt &&
        !pathname.startsWith(ROUTES.ONBOARDING) &&
        !pathname.startsWith("/api/") &&
        !pathname.startsWith(ROUTES.SIGN_OUT)
      ) {
        const host = request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
        const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
        return Response.redirect(new URL(ROUTES.ONBOARDING, `${proto}://${host}`));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
