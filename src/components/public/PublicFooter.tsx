"use client";

import Link from "next/link";
import { CURRENT_RELEASE } from "@/config/changelog";
import { useInsideFleetRunner } from "@/hooks/use-inside-fleet-runner";
import { APP_NAME } from "@/config/brand";

// PublicFooter — links to legal pages and support surfaces on every
// unauthenticated marketing page. Rendered by PublicSurface so individual
// pages don't need to opt in.
//
// Group A (Product): the things a visitor might want to do next.
// Group B (Legal): trust signals required for a credible product release.
// Group C (Source): GitHub, the org the product ships from.

const FOOTER_GROUPS = [
  {
    heading: "Product",
    links: [
      { label: "Download", href: "/download" },
      { label: "Sign in", href: "/sign-in" },
      { label: "Docs", href: "/docs/quickstart" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Releases", href: "/releases" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "License", href: "/license" },
    ],
  },
  {
    heading: "Source",
    links: [
      { label: "GitHub", href: "https://github.com/maonakamoto/fleetcrown", external: true },
      { label: "GitHub releases", href: "https://github.com/maonakamoto/fleetcrown-releases/releases", external: true },
      { label: "Issues", href: "https://github.com/maonakamoto/fleetcrown/issues", external: true },
    ],
  },
] as const;

export function PublicFooter() {
  // Inside the desktop app, the "Download" link is circular — strip it (the
  // rest of the footer stays useful: sign in, docs, legal, source).
  const insideRunner = useInsideFleetRunner();

  return (
    <footer className="ui-public-footer mx-auto max-w-6xl px-6 pb-12">
      <div className="ui-public-footer-grid">
        {FOOTER_GROUPS.map((group) => (
          <div key={group.heading} className="flex flex-col gap-2">
            <div className="ui-public-footer-heading">
              {group.heading}
            </div>
            {group.links
              .filter((link) => !(insideRunner && link.href === "/download"))
              .map((link) =>
              "external" in link && link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-public-link text-sm"
                >
                  {link.label}
                </a>
              ) : (
                <Link key={link.label} href={link.href} className="ui-public-link text-sm">
                  {link.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="ui-public-footer-bottom">
        <div>© {new Date().getFullYear()} {APP_NAME} · Mao Nakamoto</div>
        <Link href="/releases" className="ui-public-link font-mono">
          Fleet Runner v{CURRENT_RELEASE.version}
        </Link>
      </div>
    </footer>
  );
}
