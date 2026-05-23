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
import { APP_NAME } from "@/config/brand";

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
        <AuthFooterLink href={ROUTES.APP_HOME}>Go to {APP_NAME} →</AuthFooterLink>
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
          <p className="ui-auth-hint-emphasis">
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

  return (
    <AuthShell>
      <AuthHeading
        title="Check your inbox"
        description="We sent you a verification link. Click it to activate your account."
      />
      {sent ? (
        <p className="ui-auth-hint-emphasis">
          New link sent — check your inbox (and spam folder).
        </p>
      ) : (
        <>
          <p className="ui-auth-hint-emphasis mb-4">
            Didn&apos;t get it? Enter your email and we&apos;ll send another.
          </p>
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
                />
              </AuthField>
              {reqError && <p className="ui-error">{reqError}</p>}
              <AuthSubmitButton
                loading={loading}
                disabled={!email}
                label="Resend link →"
                loadingLabel="Sending…"
              />
            </form>
          </AuthCard>
        </>
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
