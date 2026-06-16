"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

/**
 * Final hop of the OAuth 1.0a "Sign in with X" flow. The callback route set a
 * signed `x1_ticket` httpOnly cookie; here we trigger the `x-1a` Credentials
 * provider (which reads + verifies that cookie) so Auth.js mints the session
 * the normal way — CSRF and cookie handling stay in Auth.js's hands.
 */
export default function XLoginComplete() {
  useEffect(() => {
    void signIn("x-1a", { callbackUrl: "/control" });
  }, []);

  return (
    <div className="ui-empty-page">
      <p className="ui-page-subtitle">Finishing sign-in with X…</p>
    </div>
  );
}
