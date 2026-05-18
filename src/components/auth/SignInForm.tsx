"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ROUTES } from "@/config/auth";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton,
  AuthDivider, AuthHeading, AuthSecondaryButton,
} from "@/components/auth/AuthShell";
import Link from "next/link";

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

type Mode = "email" | "owner";

function FormInner({
  githubEnabled, googleEnabled, twitterEnabled, localAuthEnabled,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  twitterEnabled: boolean;
  localAuthEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? ROUTES.APP_HOME;
  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : ROUTES.APP_HOME;

  const [mode, setMode]     = useState<Mode>("email");
  const [email, setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [ownerPwd, setOwnerPwd] = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("email-password", { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) {
      router.push(safeCallback);
    } else {
      setError("Incorrect email or password.");
    }
  }

  async function handleOwnerPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("local", { password: ownerPwd, redirect: false });
    setLoading(false);
    if (res?.ok) {
      router.push(safeCallback);
    } else {
      setError("Wrong owner password.");
    }
  }

  async function handleOAuth(provider: string) {
    setOauthLoading(provider);
    await signIn(provider, { callbackUrl: safeCallback });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  const hasOAuth = githubEnabled || googleEnabled || twitterEnabled;

  return (
    <AuthShell>
      <AuthHeading
        title="Welcome back"
        description="Sign in to your Cockpit account."
      />

      {/* Mode tabs — only show owner key tab when LOCAL_AUTH_PASSWORD is configured */}
      {localAuthEnabled && (
        <div className="mb-6 flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => switchMode("email")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === "email"
                ? "bg-white/[0.09] text-white/80"
                : "text-white/30 hover:text-white/55"
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => switchMode("owner")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === "owner"
                ? "bg-white/[0.09] text-white/80"
                : "text-white/30 hover:text-white/55"
            }`}
          >
            Owner key
          </button>
        </div>
      )}

      {mode === "email" ? (
        <AuthCard>
          {hasOAuth && (
            <>
              <div className="space-y-2">
                {githubEnabled && (
                  <AuthSecondaryButton
                    type="button"
                    onClick={() => handleOAuth("github")}
                    disabled={oauthLoading !== null}
                    className="ui-auth-secondary-btn-strong gap-2.5"
                  >
                    <GithubIcon />
                    {oauthLoading === "github" ? "Redirecting…" : "Continue with GitHub"}
                  </AuthSecondaryButton>
                )}
                {googleEnabled && (
                  <AuthSecondaryButton
                    type="button"
                    onClick={() => handleOAuth("google")}
                    disabled={oauthLoading !== null}
                    className="ui-auth-secondary-btn-strong gap-2.5"
                  >
                    <GoogleIcon />
                    {oauthLoading === "google" ? "Redirecting…" : "Continue with Google"}
                  </AuthSecondaryButton>
                )}
                {twitterEnabled && (
                  <AuthSecondaryButton
                    type="button"
                    onClick={() => handleOAuth("twitter")}
                    disabled={oauthLoading !== null}
                    className="ui-auth-secondary-btn-strong gap-2.5"
                  >
                    <XIcon />
                    {oauthLoading === "twitter" ? "Redirecting…" : "Continue with X"}
                  </AuthSecondaryButton>
                )}
              </div>
              <AuthDivider label="or email" />
            </>
          )}

          <form onSubmit={handleEmailPassword} className="space-y-3">
            <AuthField label="Email">
              <AuthInput
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </AuthField>
            <AuthField label="Password">
              <div className="space-y-1">
                <AuthInput
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
                <div className="text-right">
                  <Link
                    href={ROUTES.FORGOT_PASSWORD}
                    className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
            </AuthField>
            {error && <p className="ui-error">{error}</p>}
            <AuthSubmitButton
              loading={loading}
              disabled={!email || !password}
              label="Sign in →"
              loadingLabel="Signing in…"
            />
            <p className="text-center text-sm text-white/35">
              No account?{" "}
              <Link href={ROUTES.SIGN_UP} className="text-white/60 underline underline-offset-2 hover:text-white/80 transition-colors">
                Create one free →
              </Link>
            </p>
          </form>
        </AuthCard>
      ) : (
        <AuthCard>
          <p className="text-sm text-white/35">
            Use the owner password set in <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-white/50">LOCAL_AUTH_PASSWORD</code>.
          </p>
          <form onSubmit={handleOwnerPassword} className="space-y-3">
            <AuthField label="Owner password">
              <AuthInput
                type="password"
                value={ownerPwd}
                onChange={(e) => setOwnerPwd(e.target.value)}
                placeholder="Enter owner password"
                autoComplete="current-password"
                autoFocus
              />
            </AuthField>
            {error && <p className="ui-error">{error}</p>}
            <AuthSubmitButton
              loading={loading}
              disabled={!ownerPwd}
              label="Sign in as owner →"
              loadingLabel="Signing in…"
            />
          </form>
        </AuthCard>
      )}

    </AuthShell>
  );
}

export function SignInForm({
  githubEnabled, googleEnabled, twitterEnabled, localAuthEnabled,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  twitterEnabled: boolean;
  localAuthEnabled: boolean;
}) {
  return (
    <Suspense>
      <FormInner
        githubEnabled={githubEnabled}
        googleEnabled={googleEnabled}
        twitterEnabled={twitterEnabled}
        localAuthEnabled={localAuthEnabled}
      />
    </Suspense>
  );
}
