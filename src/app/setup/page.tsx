"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Setup failed.");
        return;
      }
      router.push("/sign-in");
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{ background: "#050505" }}
    >
      {/* Background */}
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
        <span className="text-base font-bold" style={{ letterSpacing: "-0.02em" }}>
          ✦ Cockpit
        </span>
      </nav>

      <main className="relative z-10 flex min-h-[calc(100vh-76px)] items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px]">

          <div className="mb-10 text-center">
            <div
              className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-xl"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              ✦
            </div>
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

          <div
            className="rounded-2xl p-8 space-y-5"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Your name">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Alex"
                  autoComplete="name"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
                />
              </Field>

              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
                />
              </Field>

              <Field label="Confirm password">
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
                />
              </Field>

              {error && (
                <p className="text-sm text-status-negative">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !name || !password || !confirm}
                className="w-full rounded-xl py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-35"
                style={{ background: "#ffffff", marginTop: "8px" }}
              >
                {loading ? "Creating account…" : "Create account →"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.18)" }}>
            Already have an account?{" "}
            <Link href="/sign-in" className="transition-colors hover:text-white/50">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
