"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton,
  AuthFooterLink, AuthHeading,
} from "@/components/auth/AuthShell";
import { postJson } from "@/lib/api/fetch";
import { ROUTES } from "@/config/auth";

function VerifyEmailInner() {
  const params = useSearchParams();
  const success = params.get("success") === "1";
  const error   = params.get("error");

  const [email, setEmail]   = useState("");
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [reqError, setReqError] = useState("");

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setReqError("");
    setLoading(true);
    try {
      await postJson("/api/auth/resend-verification", { email });
      setSent(true);
    } catch {
      setReqError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell>
        <AuthHeading
          title="Email verified ✓"
          description="Your email address has been confirmed. You're all set."
        />
        <AuthFooterLink href={ROUTES.APP_HOME}>Go to Cockpit →</AuthFooterLink>
      </AuthShell>
    );
  }

  if (error === "invalid") {
    return (
      <AuthShell>
        <AuthHeading
          title="Link expired"
          description="This verification link is invalid or has expired. Enter your email to get a new one."
        />
        {sent ? (
          <p className="text-center text-sm text-white/50">
            Check your inbox — a new verification link is on the way.
          </p>
        ) : (
          <AuthCard>
            <form onSubmit={handleResend} className="space-y-3">
              <AuthField label="Email">
                <AuthInput
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  autoFocus
                />
              </AuthField>
              {reqError && <p className="ui-error">{reqError}</p>}
              <AuthSubmitButton
                loading={loading}
                disabled={!email}
                label="Send new link →"
                loadingLabel="Sending…"
              />
            </form>
          </AuthCard>
        )}
        <AuthFooterLink href={ROUTES.SIGN_IN}>← Back to sign in</AuthFooterLink>
      </AuthShell>
    );
  }

  // Default: verify-email landing for users who registered but haven't clicked yet
  return (
    <AuthShell>
      <AuthHeading
        title="Check your inbox"
        description="We sent you a verification link. Click it to activate your account."
      />
      {sent ? (
        <p className="text-center text-sm text-white/50">
          New link sent — check your inbox (and spam folder).
        </p>
      ) : (
        <AuthCard>
          <p className="mb-4 text-sm text-white/50">
            Didn&apos;t get the email? Enter your address to resend it.
          </p>
          <form onSubmit={handleResend} className="space-y-3">
            <AuthField label="Email">
              <AuthInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </AuthField>
            {reqError && <p className="ui-error">{reqError}</p>}
            <AuthSubmitButton
              loading={loading}
              disabled={!email}
              label="Resend verification →"
              loadingLabel="Sending…"
            />
          </form>
        </AuthCard>
      )}
      <AuthFooterLink href={ROUTES.SIGN_IN}>← Back to sign in</AuthFooterLink>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
