import { cache } from "react";
import { getUserByUsername } from "@/db/queries/users";
import Link from "next/link";
import { ExternalLink, BookOpen, Folder, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/shared/Avatar";
import { ROUTES, PUBLIC_NAV_LINKS } from "@/config/auth";
import { APP_TAGLINE } from "@/config/brand";

// Deduplicate the user lookup across generateMetadata + the page component.
// Both run in the same request; React cache() collapses them to one DB query.
const getUser = cache(getUserByUsername);
import { BrandMark } from "@/components/shell/BrandMark";
import { getPublicProjects } from "@/db/queries/user-projects";
import { listThoughts } from "@/lib/thoughts-content";
import { HEALTH_TAG_STYLE } from "@/config/ui";
import { APP_NAME } from "@/config/brand";
import type { DevLogEntry } from "@/db/schema/user-projects";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await getUser(username);
  // Root layout's title template appends "— Cockpit" — don't double it here.
  if (!user) return { title: "Not Found" };
  return {
    title: user.name ?? username,
    description: `${user.name ?? username}'s builder profile on ${APP_NAME}`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await getUser(username);
  if (!user) notFound();

  const projects = await getPublicProjects(user.id);
  // Only show filesystem-based essays on the site owner's profile.
  // Team member profiles have no associated authored content.
  const allThoughts = user.isDefault ? listThoughts() : [];
  const recentThoughts = allThoughts
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text-primary">
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href="/"
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-border-interactive"
        >
          <BrandMark showWordmark={false} />
        </Link>
        {/* Desktop-only — anonymous share-target visitors get a path to the rest
            of the marketing site without typing URLs. Mobile users have the
            footer CTA + the brand-home link instead. */}
        <div className="hidden items-center gap-6 md:flex">
          {PUBLIC_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={ROUTES.SIGN_IN}
            className="text-sm font-medium text-text-primary transition-opacity hover:opacity-80"
          >
            Sign in
          </Link>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-2xl px-6 py-10 pb-20">
        {/* Profile header */}
        <div className="flex items-center gap-4">
          <Avatar src={user.image} name={user.name ?? username} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold">{user.name ?? username}</h1>
            <p className="text-sm text-text-secondary">@{username}</p>
          </div>
        </div>

        {/* Building */}
        <section className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <Folder className="h-4 w-4 text-text-tertiary" />
            <span className="ui-kicker">Building</span>
          </div>
          {projects.length === 0 ? (
            <p className="text-sm text-text-tertiary">No public projects yet.</p>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => {
                const log = project.devLog as DevLogEntry[];
                const latest = log.length > 0 ? log[log.length - 1] : null;
                const healthKey = (latest?.health ?? "").toLowerCase();
                const healthCls = HEALTH_TAG_STYLE[healthKey];
                return (
                  <a
                    key={project.id}
                    href={project.gitUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-card-shell block p-4 transition-colors hover:bg-surface-raised"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{project.name}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        </div>
                        {project.description && (
                          <p className="mt-1 text-sm text-text-secondary line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </div>
                      {healthCls && (
                        <span className={`${healthCls} shrink-0`}>{latest!.health}</span>
                      )}
                    </div>
                    {project.stack && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {project.stack.split(/[,·\s]+/).filter(Boolean).map((tech) => (
                          <span key={tech} className="ui-tag ui-tag-neutral">{tech}</span>
                        ))}
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </section>

        {/* Writing */}
        {recentThoughts.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-4 w-4 text-text-tertiary" />
              <span className="ui-kicker">Writing</span>
            </div>
            <div className="space-y-3">
              {recentThoughts.map((article) => (
                <Link
                  key={article.slug}
                  href={`/thoughts/${article.slug}`}
                  className="ui-card-shell block p-4 transition-colors hover:bg-surface-raised"
                >
                  <p className="text-xs text-text-muted mb-1">{article.publishedAt}</p>
                  <p className="font-medium text-text-primary">{article.title}</p>
                  {article.summary && (
                    <p className="mt-1 text-sm text-text-secondary line-clamp-2">{article.summary}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {article.tags.map((tag) => (
                      <span key={tag} className="ui-tag ui-tag-neutral">{tag}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
            {allThoughts.length > 4 && (
              <Link
                href="/thoughts"
                className="mt-3 inline-block text-sm text-accent-text hover:text-accent-hover transition-colors"
              >
                View all {allThoughts.length} essays →
              </Link>
            )}
          </section>
        )}

        {/* Branded footer CTA — always visible so empty-state profiles still
            offer the share-target visitor a path forward. */}
        <footer className="mt-16 border-t border-border-subtle pt-8">
          <p className="text-sm text-text-tertiary">{APP_NAME} · {APP_TAGLINE}</p>
          <Link
            href={ROUTES.SIGN_UP}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-80"
          >
            Build your own command center
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </footer>
      </main>
    </div>
  );
}
