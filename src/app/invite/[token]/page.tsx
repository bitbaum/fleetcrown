"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { getJson, postJson } from "@/lib/api/fetch";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton, AuthIconBadge, AuthHeading,
} from "@/components/auth/AuthShell";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [prefillEmail, setPrefillEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getJson<{ valid: boolean; used: boolean; email?: string }>(`/api/invitations/${token}`)
      .then((data) => {
        if (data.valid && !data.used) {
          setStatus("valid");
          if (data.email) setPrefillEmail(data.email);
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setSubmitting(true);
    try {
      const res = await postJson(`/api/invitations/${token}/accept`, { name, password });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed."); return; }

      const result = await signIn("local", { password, redirect: false });
      if (result?.ok) {
        router.push("/today");
      } else {
        router.push("/sign-in");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const heading =
    status === "loading" ? "Checking…" :
    status === "invalid" ? "Link expired" :
    "You're invited";

  const subheading =
    status === "loading" ? "Verifying your invitation link." :
    status === "invalid" ? "This invitation is invalid or has already been used." :
    prefillEmail ? `Joining as ${prefillEmail}.` : "Create your Cockpit account.";

  return (
    <AuthShell>
      <AuthHeading
        badge={<AuthIconBadge>✦</AuthIconBadge>}
        title={heading}
        description={subheading}
      />

      {status === "invalid" && (
        <p className="ui-auth-note">
          <Link href="/sign-in" className="ui-auth-inline-link">Sign in</Link>{" "}
          if you already have an account.
        </p>
      )}

      {status === "valid" && (
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

            {prefillEmail && (
              <AuthField label="Email">
                <AuthInput
                  type="email"
                  value={prefillEmail}
                  disabled
                  className="ui-auth-input-disabled"
                />
              </AuthField>
            )}

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
              loading={submitting}
              disabled={!name || !password || !confirm}
              label="Create account →"
              loadingLabel="Creating account…"
            />
          </form>
        </AuthCard>
      )}
    </AuthShell>
  );
}
