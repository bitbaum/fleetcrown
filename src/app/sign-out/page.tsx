"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { AuthShell, AuthCard, AuthIconBadge } from "@/components/auth/AuthShell";

export default function SignOutPage() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await signOut({ callbackUrl: "/sign-in" });
  }

  return (
    <AuthShell showHomeLink>
      <div className="mb-10 text-center">
        <AuthIconBadge>✦</AuthIconBadge>
        <h1
          className="font-bold"
          style={{
            fontSize: "clamp(32px, 5vw, 44px)",
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
          }}
        >
          Sign out?
        </h1>
        <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.38)" }}>
          You&apos;ll need your password to sign back in.
        </p>
      </div>

      <AuthCard>
        <div className="space-y-3">
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="w-full rounded-xl py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:opacity-70 disabled:opacity-35"
            style={{ background: "#ffffff", marginTop: "0px" }}
          >
            {loading ? "Signing out…" : "Sign out →"}
          </button>
          <button
            onClick={() => history.back()}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.50)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.50)"; }}
          >
            Cancel
          </button>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
