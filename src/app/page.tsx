import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserCount } from "@/db/queries/users";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { DesktopDownload } from "@/components/public/DesktopDownload";
import { PRODUCT_SURFACES, START_PATHS } from "@/config/marketing-content";
import {
  MARKETING_TAGLINE,
  MARKETING_SUBTITLE,
  MARKETING_HERO_PRIMARY,
  MARKETING_HERO_SECONDARY,
  MARKETING_POSITIONING,
} from "@/config/brand";
import { ROUTES } from "@/config/auth";

export default async function LandingPage() {
  if ((await getUserCount()) === 0) redirect("/setup");

  const session = await auth();
  if (session?.user) {
    const done =
      session.user.onboardingComplete === true ||
      Boolean(session.user.onboardedAt && session.user.username);
    redirect(done ? ROUTES.APP_HOME : ROUTES.ONBOARDING);
  }

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-public-hero-fold">
        <div className="max-w-5xl">
          <div className="ui-public-hero-badge">
            {MARKETING_POSITIONING}
          </div>

          <h1 className="ui-public-hero-title">
            {MARKETING_HERO_PRIMARY}<br />
            <span className="text-text-tertiary">{MARKETING_HERO_SECONDARY}</span>
          </h1>

          <p className="ui-public-hero-lede">
            {MARKETING_TAGLINE}
          </p>

          <p className="ui-public-hero-sublede">
            {MARKETING_SUBTITLE}
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link href={ROUTES.SIGN_UP} className="ui-public-cta">
              Start building
            </Link>
            <Link href="/download" className="ui-public-cta-ghost">
              Download runner
            </Link>
          </div>
        </div>
      </div>

      <div className="ui-public-band py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-end">
            <div>
              <div className="ui-public-eyebrow">PRODUCT</div>
              <h2 className="ui-public-display-lg mt-4">One control plane. Local execution.</h2>
            </div>
            <p className="ui-public-section-lede md:justify-self-end">
              FleetCrown is built for operators already running multiple AI agents across multiple projects. It makes the work visible, steerable, and recoverable.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {PRODUCT_SURFACES.map((surface) => (
              <section key={surface.label} className="ui-public-surface-card">
                <div className="ui-public-surface-card-label">{surface.label}</div>
                <h3 className="ui-public-surface-card-title">{surface.title}</h3>
                <p className="ui-public-surface-card-body">{surface.body}</p>
                <div className="ui-public-surface-card-meta">{surface.meta}</div>
              </section>
            ))}
          </div>
        </div>
      </div>

      <div className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-x-16 gap-y-20 md:grid-cols-2">
            <div>
              <div className="ui-public-eyebrow">EXECUTION</div>
              <h3 className="ui-public-display-md mt-3">The work happens locally.</h3>
              <p className="ui-public-section-lede mt-6">
                Your agents run on your machines with full access to your environment, tools, and context.
                No remote sandbox limitations.
              </p>
            </div>
            <div>
              <div className="ui-public-eyebrow">CONTROL</div>
              <h3 className="ui-public-display-md mt-3">Command from anywhere.</h3>
              <p className="ui-public-section-lede mt-6">
                The web portal gives you complete visibility and control over your entire fleet —
                whether your laptop is open or not.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="ui-public-band py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:items-start">
            <div>
              <div className="ui-public-eyebrow">LIVE SURFACE</div>
              <h2 className="ui-public-display-md mt-4">Built around the state real agent work produces.</h2>
              <p className="ui-public-section-lede mt-6">
                The product is not a chat box. It is an operational surface for sessions, queues, handoffs, and machine-local execution.
              </p>
            </div>

            <div className="ui-public-terminal-demo">
              <div className="ui-public-terminal-row">
                <span>projects/main</span>
                <span>Continuous</span>
              </div>
              <div className="ui-public-terminal-line">❯ migrate auth from sessions to jwt</div>
              <div className="ui-public-terminal-muted">read_file src/proxy.ts · inspect callbackUrl · patch matcher</div>
              <div className="ui-public-terminal-grid">
                <div>
                  <div className="ui-public-terminal-stat">11</div>
                  <div className="ui-public-terminal-label">active projects</div>
                </div>
                <div>
                  <div className="ui-public-terminal-stat">4</div>
                  <div className="ui-public-terminal-label">agents running</div>
                </div>
                <div>
                  <div className="ui-public-terminal-stat">7</div>
                  <div className="ui-public-terminal-label">queued intents</div>
                </div>
              </div>
              <div className="ui-public-terminal-footer">local runner connected · remote command enabled</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="ui-public-eyebrow">HOW IT WORKS</div>
        <h2 className="ui-public-display-lg mt-4">One system. Two surfaces.</h2>

        <div className="ui-public-body-lg mx-auto mt-16 max-w-3xl space-y-16 text-left">
          <div className="flex gap-8">
            <div className="ui-public-step-num">01</div>
            <div>
              <div className="ui-public-prose-strong">Install the local runner</div>
              <div className="ui-public-prose-muted mt-2">
                A native application on your machines that actually executes agents in your terminal environment (Zellij, Claude, Grok, Codex, etc.).
                <a href="/download" className="ui-public-link ml-1">Download →</a>
              </div>
            </div>
          </div>
          <div className="flex gap-8">
            <div className="ui-public-step-num">02</div>
            <div>
              <div className="ui-public-prose-strong">Control from the web</div>
              <div className="ui-public-prose-muted mt-2">The portal gives you fleet overview, per-project autonomy controls, queues, handoffs, and the ability to steer agents from anywhere.</div>
            </div>
          </div>
          <div className="flex gap-8">
            <div className="ui-public-step-num">03</div>
            <div>
              <div className="ui-public-prose-strong">One source of truth</div>
              <div className="ui-public-prose-muted mt-2">Your local machines do the work. The web orchestrates. Both surfaces reflect the same reality.</div>
            </div>
          </div>
        </div>
      </div>

      <DesktopDownload />

      <div className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <div className="ui-public-eyebrow">GET STARTED</div>
            <h2 className="ui-public-display-lg mt-4">Choose your entry point.</h2>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {START_PATHS.map((path) => (
              <section key={path.title} className="ui-public-start-card">
                <h3 className="ui-public-start-card-title">{path.title}</h3>
                <p className="ui-public-start-card-body">{path.body}</p>
                <Link href={path.href} className="ui-public-start-card-link">
                  {path.cta} →
                </Link>
              </section>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border-subtle py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="ui-public-eyebrow">THE DIFFERENCE</div>
          <h2 className="ui-public-display-lg mt-4">Not another coding agent.</h2>
          <p className="ui-public-section-lede mt-4">
            Most tools help you write code faster in one file or one project. We help serious builders run and orchestrate real agent operations at fleet scale.
          </p>

          <div className="ui-public-body-lg mt-12 space-y-10">
            <div>
              <div className="ui-public-prose-strong">Local execution is the foundation</div>
              <p className="ui-public-prose-muted mt-2">Your agents run on your machines with full access to your environment. We do not force everything through remote sandboxes.</p>
            </div>
            <div>
              <div className="ui-public-prose-strong">Fleet orchestration, not single-agent assistance</div>
              <p className="ui-public-prose-muted mt-2">Built for people already running many agents across many projects. Explicit per-project autonomy levels instead of one generic agent.</p>
            </div>
            <div>
              <div className="ui-public-prose-strong">Local runner + web command center</div>
              <p className="ui-public-prose-muted mt-2">The desktop application executes. The web portal gives you fleet visibility and remote control. Two surfaces, one system.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border-subtle py-20 text-center">
        <Link href={ROUTES.SIGN_UP} className="ui-public-cta-lg">
          Begin
        </Link>
        <p className="ui-public-meta mt-4">For builders running real agent operations.</p>
      </div>
    </PublicSurface>
  );
}
