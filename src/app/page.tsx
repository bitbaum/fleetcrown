import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";

export default async function LandingPage() {
  const [{ value }] = await db.select({ value: count() }).from(users);
  if (value === 0) redirect("/setup");

  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <div className="relative min-h-screen overflow-hidden text-white" style={{ background: "#050505" }}>

      {/* Background: layered glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Primary center glow — much more visible */}
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: "900px",
            height: "700px",
            background: "radial-gradient(ellipse at center top, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 40%, transparent 70%)",
          }}
        />
        {/* Secondary ambient fill */}
        <div
          className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "1200px",
            height: "600px",
            background: "radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 60%)",
          }}
        />
        {/* Fine grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 70%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 70%, transparent 100%)",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 sm:px-14">
        <span
          className="text-base font-bold tracking-tight"
          style={{ letterSpacing: "-0.02em" }}
        >
          ✦ Cockpit
        </span>
        <Link
          href="/sign-in"
          className="rounded-full px-5 py-2 text-sm font-medium transition-all"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.55)",
          }}
          onMouseEnter={undefined}
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex min-h-[calc(100vh-76px)] flex-col items-center justify-center px-6 pb-28 text-center">

        {/* Pill */}
        <div
          className="mb-12 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.02em",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "oklch(0.72 0.14 145)" }}
          />
          Private · Self-hosted · Open source
        </div>

        {/* Headline */}
        <h1
          className="max-w-4xl font-bold"
          style={{
            fontSize: "clamp(52px, 8vw, 108px)",
            lineHeight: 1.0,
            letterSpacing: "-0.04em",
            fontFamily: "var(--font-space-display)",
          }}
        >
          Command your
          <br />
          <span style={{ color: "rgba(255,255,255,0.28)" }}>AI fleet.</span>
        </h1>

        {/* Subline */}
        <p
          className="mt-8 max-w-md text-lg leading-relaxed"
          style={{ color: "rgba(255,255,255,0.40)", fontSize: "1.125rem" }}
        >
          Add projects. Launch agents. Watch them build.
          <br className="hidden sm:block" />
          Stay in command — no code required.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-full px-8 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-85"
            style={{ background: "#ffffff" }}
          >
            Get started →
          </Link>
          <a
            href="https://github.com/g-but/cockpit"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-8 py-3 text-sm font-medium transition-all"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.50)",
            }}
          >
            View source
          </a>
        </div>

        {/* Features row */}
        <div
          className="mt-24 grid w-full max-w-3xl gap-4 sm:grid-cols-3"
        >
          {[
            { icon: "⊞", title: "Fleet view", body: "All your AI agents on one screen. See what's running, what's ready, what needs attention." },
            { icon: "⚡", title: "Auto-continue", body: "Agents stop, you get a popup. One keypress to resume, redirect, or close the session." },
            { icon: "◎", title: "Life OS", body: "Today view, goals, habits, people, money — all piped through the same AI pipeline." },
          ].map(({ icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl p-6 text-left"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                className="mb-3 text-xl"
                style={{ color: "rgba(255,255,255,0.60)" }}
              >
                {icon}
              </div>
              <div
                className="mb-1.5 text-sm font-semibold"
                style={{ color: "rgba(255,255,255,0.80)" }}
              >
                {title}
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>

        {/* Footer line */}
        <p
          className="mt-16 text-xs"
          style={{ color: "rgba(255,255,255,0.18)", letterSpacing: "0.04em" }}
        >
          BUILT ON CLAUDE · RUNS ON YOUR MACHINE · NO DATA LEAVES YOUR HOME
        </p>
      </main>
    </div>
  );
}
