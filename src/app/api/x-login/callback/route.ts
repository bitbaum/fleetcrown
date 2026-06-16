import { NextRequest, NextResponse } from "next/server";
import { accessToken, mintTicket } from "@/lib/x-oauth1";
import { APP_URL } from "@/config/brand";
import { logDebug } from "@/db/queries/debug-logs";

// Step 2: X redirects here with oauth_token + oauth_verifier. Exchange them for
// an access token (→ X user id + handle), mint a short-lived signed ticket, and
// hand off to /x-login/complete which establishes the session via the `x-1a`
// Credentials provider. The user row itself is found/created in that provider's
// authorize(), so this route stays side-effect-light.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const oauthToken = req.nextUrl.searchParams.get("oauth_token");
  const verifier = req.nextUrl.searchParams.get("oauth_verifier");
  const tokenSecret = req.cookies.get("x1_req_secret")?.value;

  // No verifier (user hit "Cancel" on X, or the secret cookie expired).
  if (!oauthToken || !verifier || !tokenSecret) {
    return NextResponse.redirect(`${APP_URL}/sign-in?error=XLoginDenied`);
  }

  try {
    const { user_id, screen_name } = await accessToken(oauthToken, tokenSecret, verifier);
    const ticket = mintTicket({ xId: user_id, handle: screen_name });
    const res = NextResponse.redirect(`${APP_URL}/x-login/complete`);
    res.cookies.delete("x1_req_secret");
    res.cookies.set("x1_ticket", ticket, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 120,
    });
    return res;
  } catch (e) {
    await logDebug({
      source: "x-login.callback",
      level: "error",
      message: (e as Error)?.message ?? String(e),
      meta: {},
    }).catch(() => {});
    return NextResponse.redirect(`${APP_URL}/sign-in?error=XLoginCallback`);
  }
}
