"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";
import { Loader2 } from "lucide-react";
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
      <div className="flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    </AuthShell>
  );
}
