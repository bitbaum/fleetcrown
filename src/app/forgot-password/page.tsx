"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton,
  AuthFooterLink, AuthHeading,
} from "@/components/auth/AuthShell";
import { postJson } from "@/lib/api/fetch";
import { ROUTES } from "@/config/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await postJson("/api/auth/forgot-password", { email });
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell>
        <AuthHeading
          title="Check your email"
          description={`If an account exists for ${email}, we've sent a reset link. Check your inbox (and spam folder).`}
        />
        <AuthFooterLink href={ROUTES.SIGN_IN}>← Back to sign in</AuthFooterLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Forgot your password?"
        description="Enter your email and we'll send you a reset link."
      />

      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && <p className="ui-error">{error}</p>}

          <AuthSubmitButton
            loading={loading}
            disabled={!email}
            label="Send reset link →"
            loadingLabel="Sending…"
          />
        </form>
      </AuthCard>

      <p className="mt-4 text-center text-xs text-text-muted">
        Remember it?{" "}
        <Link href={ROUTES.SIGN_IN} className="text-text-secondary underline underline-offset-2 hover:text-text-primary">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
