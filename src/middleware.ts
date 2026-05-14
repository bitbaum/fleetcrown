import { auth } from "@/auth";
import { NextResponse } from "next/server";

// UI paths that don't require authentication
const PUBLIC_UI_PREFIXES = [
  "/sign-in",
  "/sign-out",
  "/setup",
  "/thoughts",  // Public essays
];

function isPublicUI(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_UI_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Middleware only protects UI pages — API routes handle their own auth.
// This ensures the daemon's bearer-token requests reach the route handlers.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Let API routes, NextAuth, and static assets through without session check
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  if (isPublicUI(pathname)) return NextResponse.next();

  // All other UI routes require a session
  if (!req.auth?.user?.id) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
