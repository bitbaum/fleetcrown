"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton, AuthDivider, AuthFooterLink,
} from "@/components/auth/AuthShell";

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/today";
  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/today";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  async function handleLocal(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("local", { password, redirect: false });
    setLoading(false);
    if (res?.ok) {
      router.push(safeCallback);
    } else {
      setError("Wrong password.");
    }
  }

  async function handleGithub() {
    setGithubLoading(true);
    await signIn("github", { callbackUrl: safeCallback });
  }

  return (
    <AuthShell showHomeLink>
      <div className="mb-10 text-center">
        <h1
          className="font-bold leading-none tracking-[-0.04em]"
          style={{ fontSize: "clamp(36px, 5vw, 48px)" }}
        >
          Welcome back
        </h1>
        <p className="mt-3 text-base text-white/38">
          Sign in to your Cockpit.
        </p>
      </div>

      <AuthCard>
        <form onSubmit={handleLocal} className="space-y-3">
          <AuthField label="Local password">
            <AuthInput
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password…"
              autoComplete="current-password"
            />
          </AuthField>
          {error && <p className="text-sm text-status-negative">{error}</p>}
          <AuthSubmitButton
            loading={loading}
            disabled={!password}
            label="Sign in →"
            loadingLabel="Signing in…"
          />
        </form>

        <AuthDivider label="or continue with" />

        <button
          type="button"
          onClick={handleGithub}
          disabled={githubLoading}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3 text-sm font-medium bg-white/[0.06] border border-white/[0.10] text-white/65 hover:border-white/[0.22] hover:text-white/90 transition-all disabled:opacity-40"
        >
          <GithubIcon />
          {githubLoading ? "Redirecting…" : "Continue with GitHub"}
        </button>
      </AuthCard>

      <AuthFooterLink href="/">← Back to home</AuthFooterLink>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
