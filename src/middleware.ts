import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC = new Set(["/", "/sign-in", "/setup"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Static/API paths — let them through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Invitation registration pages — publicly accessible
  if (pathname.startsWith("/invite/")) {
    return NextResponse.next();
  }

  // Public pages — always accessible
  if (PUBLIC.has(pathname)) {
    return NextResponse.next();
  }

  // App pages require a session
  if (!req.auth?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
