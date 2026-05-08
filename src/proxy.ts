import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/", "/sign-in", "/setup"]);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  // Static/API paths — let them through (API routes handle their own auth)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Public pages, invite registration, and beacon popup — always accessible
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/invite/") || pathname.startsWith("/beacon/")) {
    return NextResponse.next();
  }

  // Unauthenticated → sign-in with return URL
  if (!req.auth) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  // Authenticated but no username yet → onboarding
  if (!req.auth.user?.username && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
