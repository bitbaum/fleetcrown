import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";
import { PublicSurface } from "@/components/public/PublicSurface";
import {
  LANDING_BADGE,
  LANDING_FEATURES,
  LANDING_FOOTER,
  LANDING_HEADLINE,
  LANDING_SUBTITLE,
} from "@/config/marketing";
import { PUBLIC_SURFACE } from "@/config/ui";

export default async function LandingPage() {
  const [{ value }] = await db.select({ value: count() }).from(users);
  if (value === 0) redirect("/setup");

  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <PublicSurface
      right={(
        <Link
          href="/sign-in"
          className="ui-public-nav-action"
        >
          Sign in
        </Link>
      )}
    >
      <main
        className="relative z-10 flex flex-col items-center justify-center px-6 pb-28 text-center"
        style={{ minHeight: `calc(100vh - ${PUBLIC_SURFACE.navHeightPx}px)` }}
      >
        <div className="ui-public-badge mb-12">
          <span className="h-1.5 w-1.5 rounded-full bg-status-positive" />
          {LANDING_BADGE}
        </div>

        <h1 className="ui-public-title">
          {LANDING_HEADLINE[0]}
          <br />
          <span className="ui-public-title-muted">{LANDING_HEADLINE[1]}</span>
        </h1>

        <p className="ui-public-subtitle">
          {LANDING_SUBTITLE}
        </p>

        <div className="mt-10 flex items-center gap-3">
          <Link
            href="/sign-in"
            className="ui-public-primary-action"
          >
            Get started →
          </Link>
          <a
            href="https://github.com/g-but/cockpit"
            target="_blank"
            rel="noopener noreferrer"
            className="ui-public-nav-action px-8 py-3"
          >
            View source
          </a>
        </div>

        <div className="mt-24 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {LANDING_FEATURES.map(({ icon, title, body }) => (
            <div
              key={title}
              className="ui-public-feature-card"
            >
              <div className="ui-public-feature-icon">{icon}</div>
              <div className="ui-public-feature-title">{title}</div>
              <p className="ui-public-feature-body">{body}</p>
            </div>
          ))}
        </div>

        <p className="ui-public-footer">
          {LANDING_FOOTER}
        </p>
      </main>
    </PublicSurface>
  );
}
