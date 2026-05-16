"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton,
  AuthFooterLink, AuthHeading,
} from "@/components/auth/AuthShell";
import { postJson } from "@/lib/api/fetch";

export default function SignUpPage() {
  const router = useRouter();

  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      const res = await postJson("/api/auth/register", { name, email, password });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed."); return; }

      const result = await signIn("email-password", { email, password, redirect: false });
      if (result?.ok) {
        router.push("/today");
      } else {
        router.push("/sign-in");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Create your account"
        description="Join Cockpit to manage your projects and fleet."
      />

      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="Your name">
            <AuthInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Manu"
              autoComplete="name"
              required
            />
          </AuthField>

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

          <AuthField label="Password">
            <AuthInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
          </AuthField>

          <AuthField label="Confirm password">
            <AuthInput
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              required
            />
          </AuthField>

          {error && <p className="ui-error">{error}</p>}

          <AuthSubmitButton
            loading={loading}
            disabled={!name || !email || !password || !confirm}
            label="Create account →"
            loadingLabel="Creating account…"
          />
        </form>
      </AuthCard>

      <AuthFooterLink href="/sign-in">
        Already have an account? Sign in →
      </AuthFooterLink>
    </AuthShell>
  );
}
