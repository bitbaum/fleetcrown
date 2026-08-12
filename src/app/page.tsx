import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserCount, getDefaultUser } from "@/db/queries/users";
import { getHeroFleetSnapshot, getShippedFromFeedbackSnapshot, type HeroFleetSnapshot, type ShippedFeedbackSnapshot } from "@/db/queries/public-fleet";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { PRODUCT_SURFACES, START_PATHS, HOME_HERO_CONSOLE, DESKTOP_DOWNLOAD } from "@/config/marketing-content";
import {
  APP_NAME,
  MARKETING_TAGLINE,
  MARKETING_SUBTITLE,
  MARKETING_HERO_PRIMARY,
  MARKETING_HERO_SECONDARY,
  MARKETING_POSITIONING,
} from "@/config/brand";
import { ROUTES } from "@/config/auth";
import { isFleetRunnerRequest } from "@/lib/fleet-runner";

export default async function LandingPage() {
  if ((await getUserCount()) === 0) redirect("/setup");

  // Inside the desktop app the visitor already has the runner — pitching them
  // a download is circular. Drop every "Download Fleet Runner" CTA in that case.
  const insideRunner = await isFleetRunnerRequest();

  const session = await auth();
  // Onboarding is an unfinished flow — keep the redirect so the user finishes it.
  // But once onboarding is done, the homepage is just another public page they
  // are allowed to read. PublicHeaderActions surfaces an "Open FleetCrown →"
  // entry into the app for signed-in visitors.
  let signedIn = false;
  if (session?.user) {
    const done =
      session.user.onboardingComplete === true ||
      Boolean(session.user.onboardedAt && session.user.username);
    if (!done) redirect(ROUTES.ONBOARDING);
    signedIn = true;
  }

  // Real fleet snapshot for the hero console — the OWNER's actual fleet (founder
  // dogfooding), public-safe fields only. Never fabricated. Falls back to an
  // empty snapshot if the owner/data can't be resolved, so the hero degrades
  // gracefully rather than showing invented numbers.
  const owner = await getDefaultUser().catch(() => null);
  const fleet: HeroFleetSnapshot = owner
    ? await getHeroFleetSnapshot(owner.id).catch(() => ({ isLive: false, projects: [], metrics: [] }))
    : { isLive: false, projects: [], metrics: [] };
  // "Shipped thanks to feedback" — operator-featured resolved reports only
  // (raw visitor text never auto-publishes). Renders nothing until real
  // entries exist, per the same never-fabricate doctrine as the hero.
  const emptyShipped: ShippedFeedbackSnapshot = { resolvedCount: 0, medianResolutionHours: null, entries: [] };
  const shipped: ShippedFeedbackSnapshot = owner
    ? await getShippedFromFeedbackSnapshot(owner.id).catch(() => emptyShipped)
    : emptyShipped;

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-public-hero-fold">
        <div className="w-full max-w-5xl">
          <div className="ui-public-hero-badge">
            {MARKETING_POSITIONING}
          </div>

          <h1 className="ui-public-hero-title">
            {MARKETING_HERO_PRIMARY}<br />
            <span className="ui-public-hero-title-dim">{MARKETING_HERO_SECONDARY}</span>
          </h1>

          <p className="ui-public-hero-lede">
            {MARKETING_TAGLINE}
          </p>

          <p className="ui-public-hero-sublede">
            {MARKETING_SUBTITLE}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href={signedIn ? ROUTES.APP_HOME : ROUTES.SIGN_UP} className="ui-public-cta">
              {signedIn ? `Open ${APP_NAME}` : "Start building"}
            </Link>
            {!insideRunner && (
              <Link href="/download" className="ui-public-cta-ghost">
                Download runner
              </Link>
            )}
          </div>

          {/* Hero product visual — a REAL snapshot of the owner's fleet (founder
              dogfooding), fetched server-side. Public-safe fields only; "LIVE"
              shows only when an agent is actually running. Hidden if there's no
              fleet data, so we never render an empty/fake box. */}
          {fleet.metrics.length > 0 && (
            <div className="ui-public-hero-console">
              <div className="ui-public-hero-console-bar">
                <span className="ui-public-hero-console-label">{HOME_HERO_CONSOLE.label}</span>
                <span className={`ui-public-hero-console-live${fleet.isLive ? "" : " ui-public-hero-console-live-idle"}`}>
                  {fleet.isLive ? "Live" : "Fleet"}
                </span>
              </div>
              {fleet.projects.length > 0 && (
                <div className="ui-public-hero-console-rows">
                  {fleet.projects.map((project) => (
                    <div key={project.name} className="ui-public-hero-console-row">
                      <span className={`ui-public-hero-console-dot ui-public-hero-console-dot-${project.state}`} />
                      <span className="ui-public-hero-console-name">{project.name}</span>
                      {project.note && <span className="ui-public-hero-console-note">{project.note}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="ui-public-hero-console-metrics">
                {fleet.metrics.map((metric) => (
                  <div key={metric.label}>
                    <div className="ui-public-hero-console-metric-num">{metric.value}</div>
                    <div className="ui-public-hero-console-metric-label">{metric.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
              {APP_NAME} is built for operators already running multiple AI agents across multiple projects. It makes the work visible, steerable, and recoverable.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2">
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

      {shipped.entries.length > 0 && (
        <div className="py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-end">
              <div>
                <div className="ui-public-eyebrow">SHIPPED BECAUSE A VISITOR ASKED</div>
                <h2 className="ui-public-display-md mt-4">The feedback loop, in production.</h2>
              </div>
              <p className="ui-public-section-lede md:justify-self-end">
                Real reports from the feedback widget, fixed by the fleet and deployed
                {shipped.resolvedCount > 0 && ` — ${shipped.resolvedCount} resolved so far`}.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {shipped.entries.map((entry) => (
                <section key={`${entry.project}-${entry.resolvedAt}`} className="ui-public-surface-card !min-h-0">
                  <div className="ui-public-surface-card-label">{entry.project}</div>
                  <p className="ui-public-surface-card-body">“{entry.excerpt}”</p>
                  <div className="ui-public-surface-card-meta">
                    {entry.page ? `${entry.page} · ` : ""}shipped {new Date(entry.resolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

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
              <div className="ui-public-eyebrow">THE SURFACE</div>
              <h2 className="ui-public-display-md mt-4">Built around the state real agent work produces.</h2>
              <p className="ui-public-section-lede mt-6">
                The product is not a chat box. It is an operational surface for sessions, queues, handoffs, and machine-local execution.
              </p>
            </div>

            <div className="ui-public-terminal-demo">
              <div className="ui-public-terminal-row">
                <span>projects/main</span>
                <span>Illustrative</span>
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
                {insideRunner ? (
                  <span className="ml-1 text-text-tertiary">You&apos;re running it now.</span>
                ) : (
                  <a href="/download" className="ui-public-link ml-1">Download →</a>
                )}
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

      {/* Short download band — the full DesktopDownload embed (platform picker,
          comparison table, setup steps, prerequisites) duplicated /download
          wholesale and made the homepage endless. Two lines and a link. */}
      {!insideRunner && (
        <div className="ui-public-band py-20 text-center">
          <div className="mx-auto max-w-3xl px-6">
            <div className="ui-public-eyebrow">DESKTOP APP</div>
            <h2 className="ui-public-display-md mt-4">{DESKTOP_DOWNLOAD.title}</h2>
            <p className="ui-public-section-lede mx-auto mt-6">{DESKTOP_DOWNLOAD.lede}</p>
            <p className="ui-public-meta mt-4">
              {DESKTOP_DOWNLOAD.platforms.filter((p) => p.status === "ready").map((p) => p.label).join(" · ")} today
              {DESKTOP_DOWNLOAD.platforms.some((p) => p.status !== "ready") &&
                ` · ${DESKTOP_DOWNLOAD.platforms.filter((p) => p.status !== "ready").map((p) => p.label).join(" and ")} coming soon`}
            </p>
            <div className="mt-8">
              <Link href="/download" className="ui-public-cta">
                Download Fleet Runner
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* One closing section — "Choose your entry point" and "Not another
          coding agent" were two back-to-back closers making the same pitch;
          the differentiation points also repeated the EXECUTION/CONTROL and
          SURFACE sections above. Merged: one differentiating line, then the
          three concrete entry paths. */}
      <div className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <div className="ui-public-eyebrow">GET STARTED</div>
            <h2 className="ui-public-display-lg mt-4">Not another coding agent.</h2>
            <p className="ui-public-section-lede mx-auto mt-4">
              Most tools help you write code faster in one file or one project. FleetCrown is for
              running real agent operations at fleet scale — choose your entry point.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {START_PATHS
              .filter((path) => !(insideRunner && path.href === "/download"))
              .map((path) => (
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

      <div className="border-t border-border-subtle py-20 text-center">
        <Link href={signedIn ? ROUTES.APP_HOME : ROUTES.SIGN_UP} className="ui-public-cta-lg">
          {signedIn ? `Open ${APP_NAME}` : "Begin"}
        </Link>
        <p className="ui-public-meta mt-4">For builders running real agent operations.</p>
      </div>
    </PublicSurface>
  );
}
