"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AuthShell,
  AuthCard,
  CreateAccountFields,
  AuthSubmitButton,
  AuthFooterLink,
  AuthHeading,
  AuthDivider,
} from "@/components/auth/AuthShell";
import { OAuthButtons, hasAnyOAuth, type OAuthEnabledFlags } from "@/components/auth/OAuthButtons";
import { postJson } from "@/lib/api/fetch";
import { AUTH_COPY, ROUTES, safeAuthRedirect } from "@/config/auth";

export function SignUpForm({ oauthFlags }: { oauthFlags: OAuthEnabledFlags }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * Where this account was asked for, if anywhere.
   *
   * Not everyone who registers is here to run a fleet. Someone who filed
   * feedback on a customer's site and followed the link on their own report
   * arrives with a specific question already in hand, and onboarding — pick a
   * username, register a project, connect a machine — answers none of it. So a
   * callbackUrl means "you came from somewhere; go back there", and onboarding
   * stays the default for everyone who arrived at the front door. They can
   * still onboard later; nothing here marks them as having done it.
   */
  const callback = safeAuthRedirect(searchParams.get("callbackUrl"), "");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await postJson("/api/auth/register", { name, email, password });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }

      const result = await signIn("email-password", { email, password, redirect: false });
      if (result?.ok) {
        router.push(callback || ROUTES.ONBOARDING);
      } else {
        // Registered but the sign-in leg failed: keep the destination alive
        // across the hop so they still land where they were going.
        router.push(
          callback
            ? `${ROUTES.SIGN_IN}?callbackUrl=${encodeURIComponent(callback)}`
            : ROUTES.SIGN_IN,
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading title={AUTH_COPY.signUp.title} description={AUTH_COPY.signUp.description} />

      <AuthCard>
        {/* OAuth first: signing up via an existing identity (OrangeCat above
            all — one account across the stack) beats minting a new password
            silo. First OAuth sign-in creates the account, so these are as
            much "sign up" buttons as the form below. */}
        {hasAnyOAuth(oauthFlags) && (
          <>
            <OAuthButtons flags={oauthFlags} callbackUrl={callback || ROUTES.APP_HOME} />
            <AuthDivider label="or with email" />
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <CreateAccountFields
            name={name}
            onName={setName}
            namePlaceholder="e.g. Manu"
            email={email}
            onEmail={setEmail}
            password={password}
            onPassword={setPassword}
            confirm={confirm}
            onConfirm={setConfirm}
          />

          {error && <p className="ui-error">{error}</p>}

          <AuthSubmitButton
            loading={loading}
            disabled={!name || !email || !password || !confirm}
            label="Create account →"
            loadingLabel="Creating account…"
          />
        </form>
      </AuthCard>

      <AuthFooterLink href={ROUTES.SIGN_IN}>Already have an account? Sign in →</AuthFooterLink>
    </AuthShell>
  );
}
