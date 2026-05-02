import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  // Unauthenticated → sign-in
  if (!req.auth) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  // Authenticated but no username yet → onboarding (skip if already there)
  const user = req.auth.user as { id: string; username?: string | null } & typeof req.auth.user;
  if (!user?.username && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Protect everything except: landing, sign-in, public profiles, static assets, auth API
    "/((?!$|sign-in|u/|api/auth|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
