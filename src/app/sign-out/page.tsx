"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { AuthShell, AuthCard, AuthIconBadge, AuthSubmitButton } from "@/components/auth/AuthShell";

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
          className="font-bold leading-[1.05] tracking-[-0.04em]"
          style={{ fontSize: "clamp(32px, 5vw, 44px)" }}
        >
          Sign out?
        </h1>
        <p className="mt-3 text-base text-white/38">
          You&apos;ll need your password to sign back in.
        </p>
      </div>

      <AuthCard>
        <div className="space-y-3">
          <AuthSubmitButton
            onClick={handleSignOut}
            loading={loading}
            label="Sign out →"
            loadingLabel="Signing out…"
          />
          <button
            onClick={() => history.back()}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-white/[0.04] border border-white/[0.09] text-white/50 hover:text-white/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
