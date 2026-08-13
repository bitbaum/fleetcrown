"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AUTH_COPY, ROUTES } from "@/config/auth";
import { APP_NAME } from "@/config/brand";
import {
  AuthShell, AuthCard, AuthField, AuthInput, AuthSubmitButton,
  AuthDivider, AuthHeading, AuthModeTabs,
} from "@/components/auth/AuthShell";
import { OAuthButtons, hasAnyOAuth } from "@/components/auth/OAuthButtons";
import Link from "next/link";

type Mode = "email" | "owner";

function FormInner({
  githubEnabled, googleEnabled, twitterEnabled, orangecatEnabled, localAuthEnabled,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  twitterEnabled: boolean;
  orangecatEnabled: boolean;
  localAuthEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? ROUTES.APP_HOME;
  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : ROUTES.APP_HOME;

  const urlError = searchParams.get("error");
  const urlErrorMsg = urlError === "OAuthAccountNotLinked"
    ? "This email is already registered with a different sign-in method."
    : urlError === "AccessDenied"
    ? "Access was denied. Please try again."
    : urlError
    ? "Sign-in failed. Please try again."
    : "";

  const [mode, setMode]     = useState<Mode>("email");
  const [email, setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [ownerPwd, setOwnerPwd] = useState("");
  const [error, setError]   = useState(urlErrorMsg);
  const [loading, setLoading] = useState(false);

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

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  const oauthFlags = { orangecatEnabled, githubEnabled, googleEnabled, twitterEnabled };

  return (
    <AuthShell>
      <AuthHeading
        title={AUTH_COPY.signIn.title}
        description={AUTH_COPY.signIn.description(APP_NAME)}
      />

      {/* Mode tabs — only show owner key tab when LOCAL_AUTH_PASSWORD is configured */}
      {localAuthEnabled && (
        <AuthModeTabs
          tabs={[
            { id: "email", label: "Email" },
            { id: "owner", label: "Owner key" },
          ]}
          active={mode}
          onChange={(id) => switchMode(id as Mode)}
        />
      )}

      {mode === "email" ? (
        <AuthCard>
          {hasAnyOAuth(oauthFlags) && (
            <>
              <OAuthButtons flags={oauthFlags} callbackUrl={safeCallback} />
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
            <AuthField label="Password" htmlFor="password">
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
            <p className="ui-auth-hint">
              No account?{" "}
              <Link href={ROUTES.SIGN_UP} className="ui-auth-hint-link">
                Create one free →
              </Link>
            </p>
          </form>
        </AuthCard>
      ) : (
        <AuthCard>
          <p className="ui-auth-owner-note">
            Use the owner password set in <code className="ui-auth-inline-code">LOCAL_AUTH_PASSWORD</code>.
          </p>
          <form onSubmit={handleOwnerPassword} className="space-y-3">
            <AuthField label="Owner password">
              <AuthInput
                id="owner-password"
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
  githubEnabled, googleEnabled, twitterEnabled, orangecatEnabled, localAuthEnabled,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  twitterEnabled: boolean;
  orangecatEnabled: boolean;
  localAuthEnabled: boolean;
}) {
  return (
    <Suspense>
      <FormInner
        githubEnabled={githubEnabled}
        googleEnabled={googleEnabled}
        twitterEnabled={twitterEnabled}
        orangecatEnabled={orangecatEnabled}
        localAuthEnabled={localAuthEnabled}
      />
    </Suspense>
  );
}
