import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserCount, getDefaultUser } from "@/db/queries/users";
import { getHeroFleetSnapshot, getShippedFromFeedbackSnapshot, type HeroFleetSnapshot, type ShippedFeedbackSnapshot } from "@/db/queries/public-fleet";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { HOME_PRODUCT_SURFACES, START_PATHS, HOME_HERO_CONSOLE } from "@/config/marketing-content";
import {
  APP_NAME,
  MARKETING_TAGLINE,
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
            {HOME_PRODUCT_SURFACES.map((surface) => (
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
