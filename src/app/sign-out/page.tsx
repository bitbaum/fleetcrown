"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { AuthShell, AuthCard, AuthIconBadge, AuthSubmitButton, AuthHeading, AuthSecondaryButton } from "@/components/auth/AuthShell";

export default function SignOutPage() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await signOut({ callbackUrl: "/sign-in" });
  }

  return (
    <AuthShell>
      <AuthHeading
        badge={<AuthIconBadge>✦</AuthIconBadge>}
        title="Sign out?"
        description="You will need your password to sign back in."
      />

      <AuthCard>
        <div className="space-y-3">
          <AuthSubmitButton
            onClick={handleSignOut}
            loading={loading}
            label="Sign out →"
            loadingLabel="Signing out…"
          />
          <AuthSecondaryButton
            onClick={() => history.back()}
          >
            Cancel
          </AuthSecondaryButton>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
