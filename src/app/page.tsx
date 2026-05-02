import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

const FEATURES = [
  {
    icon: "▶",
    title: "One-click launch",
    body: "Start an AI agent on any project. It picks up where it left off.",
  },
  {
    icon: "◉",
    title: "Live activity feed",
    body: "See exactly what every agent is doing, across all projects, in real time.",
  },
  {
    icon: "⟳",
    title: "Learn by watching",
    body: "Non-technical? Watch the AI work and gradually take the wheel yourself.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text-primary">
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-semibold text-text-primary">✦ Cockpit</span>
        <Link href="/sign-in" className="ui-btn-secondary py-1.5 text-xs">
          Sign in
        </Link>
      </nav>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-raised px-3 py-1 text-xs text-text-tertiary">
            Open source · Self-hostable · Pay only for model tokens
          </div>

          <h1 className="ui-page-title leading-tight">
            Your AI fleet,<br />one dashboard.
          </h1>

          <p className="mx-auto max-w-md text-base text-text-secondary leading-relaxed">
            Add your projects. Launch AI agents. Watch them build.
            Stop, review, redirect — or let them run. You stay in command
            without writing a single line of code.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/sign-in" className="ui-btn-primary px-6 py-3">
              Get started free →
            </Link>
            <a
              href="https://github.com/g-but/cockpit"
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn-secondary px-6 py-3"
            >
              View source
            </a>
          </div>
        </div>

        <div className="mt-20 grid max-w-3xl gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="ui-panel p-6 text-left">
              <div className="mb-3 text-xl text-text-secondary">{f.icon}</div>
              <div className="mb-1 text-sm font-medium text-text-primary">{f.title}</div>
              <div className="text-sm text-text-tertiary leading-relaxed">{f.body}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border-subtle px-6 py-6 text-center text-xs text-text-muted sm:px-10">
        Built with Claude · Open source · No lock-in
      </footer>
    </div>
  );
}
