"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{ background: "#050505" }}
    >
      {/* Background glows — same as landing */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: "700px",
            height: "500px",
            background: "radial-gradient(ellipse at center top, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 45%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 px-8 py-6 sm:px-14">
        <Link
          href="/"
          className="text-base font-bold tracking-tight"
          style={{ letterSpacing: "-0.02em" }}
        >
          ✦ Cockpit
        </Link>
      </nav>

      {/* Card */}
      <main className="relative z-10 flex min-h-[calc(100vh-76px)] items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px]">

          {/* Header */}
          <div className="mb-10 text-center">
            <h1
              className="font-bold"
              style={{
                fontSize: "clamp(36px, 5vw, 48px)",
                lineHeight: 1.0,
                letterSpacing: "-0.04em",
                fontFamily: "var(--font-space-display)",
              }}
            >
              Welcome back
            </h1>
            <p
              className="mt-3 text-base"
              style={{ color: "rgba(255,255,255,0.38)" }}
            >
              Sign in to your Cockpit.
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-8 space-y-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Password form */}
            <form onSubmit={handleLocal} className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  Local password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password…"
                  autoComplete="current-password"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
                />
              </div>

              {error && (
                <p className="text-sm" style={{ color: "oklch(0.68 0.16 25)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full rounded-xl py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:opacity-70 disabled:opacity-35"
                style={{ background: "#ffffff" }}
              >
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>
                or continue with
              </span>
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* GitHub */}
            <button
              type="button"
              onClick={handleGithub}
              disabled={githubLoading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3 text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.65)",
              }}
              onFocus={undefined}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
                e.currentTarget.style.color = "rgba(255,255,255,0.90)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                e.currentTarget.style.color = "rgba(255,255,255,0.65)";
              }}
            >
              <GithubIcon />
              {githubLoading ? "Redirecting…" : "Continue with GitHub"}
            </button>
          </div>

          <p
            className="mt-6 text-center text-sm"
            style={{ color: "rgba(255,255,255,0.18)" }}
          >
            <Link
              href="/"
              className="transition-colors hover:text-white/50"
            >
              ← Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
