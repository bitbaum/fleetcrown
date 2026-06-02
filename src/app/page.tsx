import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserCount } from "@/db/queries/users";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { DesktopDownload } from "@/components/public/DesktopDownload";
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
            <Link href={ROUTES.SIGN_IN} className="ui-public-cta">
              Start building
            </Link>
            <Link href="/whitepaper" className="ui-public-cta-ghost">
              Read the architecture
            </Link>
          </div>
        </div>
      </div>

      <div className="ui-public-band py-24">
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
        <Link href={ROUTES.SIGN_IN} className="ui-public-cta-lg">
          Begin
        </Link>
        <p className="ui-public-meta mt-4">For builders running real agent operations.</p>
      </div>
    </PublicSurface>
  );
}
