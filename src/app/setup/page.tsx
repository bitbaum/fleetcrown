"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { postJson } from "@/lib/api/fetch";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton, AuthIconBadge,
} from "@/components/auth/AuthShell";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      const res = await postJson("/api/setup", { name, password });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Setup failed."); return; }
      router.push("/sign-in");
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-10 text-center">
        <AuthIconBadge>✦</AuthIconBadge>
        <h1
          className="font-bold"
          style={{
            fontSize: "clamp(32px, 5vw, 44px)",
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            fontFamily: "var(--font-space-display)",
          }}
        >
          Set up Cockpit
        </h1>
        <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.38)" }}>
          Create your admin account to get started.
        </p>
      </div>

      <AuthCard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="Your name">
            <AuthInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              autoComplete="name"
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

          {error && <p className="text-sm text-status-negative">{error}</p>}

          <AuthSubmitButton
            loading={loading}
            disabled={!name || !password || !confirm}
            label="Create account →"
            loadingLabel="Creating account…"
          />
        </form>
      </AuthCard>

      <p className="mt-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.18)" }}>
        Already have an account?{" "}
        <Link href="/sign-in" className="transition-colors hover:text-white/50">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
