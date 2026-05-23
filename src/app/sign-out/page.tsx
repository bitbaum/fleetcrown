"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { AuthShell, AuthHeading, AuthLoadingCenter } from "@/components/auth/AuthShell";
import { ROUTES } from "@/config/auth";

export default function SignOutPage() {
  useEffect(() => {
    signOut({ callbackUrl: ROUTES.SIGN_IN });
  }, []);

  return (
    <AuthShell>
      <AuthHeading
        title="Signing out…"
        description="You'll be redirected to the sign-in page."
      />
      <AuthLoadingCenter />
    </AuthShell>
  );
}
