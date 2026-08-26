"use client";

import Link from "next/link";
import { CURRENT_RELEASE } from "@/config/changelog";
import { useInsideFleetRunner } from "@/hooks/use-inside-fleet-runner";
import { APP_NAME } from "@/config/brand";
import { ECOSYSTEM, ECOSYSTEM_LINKS } from "@/config/ecosystem";
import { FLEET_SITES } from "@/config/fleet-sites";

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
      { label: "Pricing", href: "/pricing" },
      { label: "Download", href: "/download" },
      { label: "Sign in", href: "/sign-in" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Changelog", href: "/releases" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Whitepaper", href: "/whitepaper" },
      { label: "Thoughts", href: "/thoughts" },
      { label: "Frontier", href: "/frontier" },
      { label: "Investors", href: "/investors" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Support FleetCrown", href: "/support" },
      { label: "GitHub issues", href: "https://github.com/maonakamoto/fleetcrown/issues", external: true },
    ],
  },
  {
    heading: "Ecosystem",
    links: [
      { label: "OrangeCat — Economy", href: ECOSYSTEM.orangeCat.siteUrl, external: true },
      { label: "Solon — Governance", href: ECOSYSTEM.solon.siteUrl, external: true },
      { label: "FleetCrown on OrangeCat", href: ECOSYSTEM_LINKS.fleetCrown, external: true },
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
] as const;

export function PublicFooter() {
  // Inside the desktop app, the "Download" link is circular — strip it (the
  // rest of the footer stays useful: sign in, docs, legal, source).
  const insideRunner = useInsideFleetRunner();

  return (
    <footer className="ui-public-footer mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12">
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
      {/* The fleet. Every site here had no inbound link from anywhere else on
          the fleet until this block existed — see config/fleet-sites.ts. Plain
          anchors, not next/link: these are other origins, and the point is that
          a crawler follows them. Collapsed by default so the three product
          pillars above stay the footer's primary content — the links remain in
          the DOM for crawlers whether or not a human ever opens the disclosure. */}
      <details className="ui-public-footer-fleet">
        <summary className="ui-public-footer-fleet-summary">
          Part of the fleet — {FLEET_SITES.length} more sites
        </summary>
        <div className="ui-public-footer-fleet-grid mt-4">
          {FLEET_SITES.map((site) => (
            <a
              key={site.url}
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-tap flex flex-col justify-center"
            >
              <span className="ui-public-footer-fleet-name">{site.name}</span>
              <span className="ui-public-footer-fleet-blurb">{site.blurb}</span>
            </a>
          ))}
        </div>
      </details>
      <div className="ui-public-footer-bottom">
        <div>© {new Date().getFullYear()} {APP_NAME} · Mao Nakamoto</div>
        <Link href="/releases" className="ui-public-link font-mono">
          Fleet Runner v{CURRENT_RELEASE.version}
        </Link>
      </div>
    </footer>
  );
}
