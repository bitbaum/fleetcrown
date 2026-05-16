import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config — no DB adapter, no Node.js crypto.
// Used by src/middleware.ts (Edge Runtime).
// Full auth with DB adapter lives in src/auth.ts.
export const authConfig = {
  session: { strategy: "jwt" } as const,
  pages: {
    signIn: "/sign-in",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      if (auth?.user) return true;

      // Daemon requests carry a bearer token instead of a session cookie.
      // Allow them through — individual routes enforce daemon-specific auth.
      const daemonToken = process.env.COCKPIT_DAEMON_TOKEN;
      if (daemonToken) {
        const authHeader = request.headers.get("authorization") ?? "";
        if (authHeader === `Bearer ${daemonToken}`) return true;
      }

      // On Vercel, the Edge Runtime sees the deployment URL (cockpit-orangecat.vercel.app)
      // not the custom alias. x-forwarded-host carries the real host the user typed.
      const host =
        request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
      const proto =
        request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
      const signInUrl = new URL("/sign-in", `${proto}://${host}`);
      const { pathname, search } = request.nextUrl;
      if (pathname !== "/sign-in") {
        signInUrl.searchParams.set("callbackUrl", pathname + search);
      }
      return Response.redirect(signInUrl);
    },
  },
} satisfies NextAuthConfig;
