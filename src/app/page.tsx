import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080808] text-white selection:bg-white/20">

      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Center radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[40%] h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)" }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-12">
        <span className="text-sm font-semibold tracking-tight text-white/90">✦ Cockpit</span>
        <Link
          href="/sign-in"
          className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white/90"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex min-h-[calc(100vh-68px)] flex-col items-center justify-center px-6 pb-24 text-center">

        {/* Status pill */}
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-[11px] font-medium text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
          Private · Self-hosted · Open source
        </div>

        {/* Headline */}
        <h1 className="max-w-3xl text-5xl font-bold leading-[1.06] tracking-[-0.03em] sm:text-6xl lg:text-[80px]">
          Command your<br />
          <span className="text-white/35">AI fleet.</span>
        </h1>

        {/* Subheadline */}
        <p className="mt-7 max-w-[380px] text-base leading-relaxed text-white/45">
          Add projects. Launch agents. Watch them build.
          Stay in command without writing a single line of code.
        </p>

        {/* CTA */}
        <div className="mt-10 flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-full bg-white px-7 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-85 active:opacity-70"
          >
            Get started →
          </Link>
          <a
            href="https://github.com/g-but/cockpit"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/15 px-7 py-2.5 text-sm font-medium text-white/55 transition-colors hover:border-white/30 hover:text-white/80"
          >
            View source
          </a>
        </div>

        {/* Proof line */}
        <p className="mt-16 text-[11px] text-white/25">
          Built on Claude · Runs on your machine · No data leaves your home
        </p>
      </main>
    </div>
  );
}
