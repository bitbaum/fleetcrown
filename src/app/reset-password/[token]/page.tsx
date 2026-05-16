"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton,
  AuthFooterLink, AuthHeading,
} from "@/components/auth/AuthShell";
import { postJson } from "@/lib/api/fetch";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      const res = await postJson("/api/auth/reset-password", { token, password });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Reset failed."); return; }
      setDone(true);
      setTimeout(() => router.push("/sign-in"), 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <AuthHeading
          title="Password updated"
          description="Your password has been reset. Redirecting to sign in…"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Set a new password"
        description="Choose a strong password for your account."
      />

      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="New password">
            <AuthInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              autoFocus
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
            disabled={!password || !confirm}
            label="Update password →"
            loadingLabel="Updating…"
          />
        </form>
      </AuthCard>

      <p className="mt-4 text-center text-xs text-text-muted">
        Link expired?{" "}
        <Link href="/forgot-password" className="text-text-secondary underline underline-offset-2 hover:text-text-primary">
          Request a new one
        </Link>
      </p>
    </AuthShell>
  );
}
