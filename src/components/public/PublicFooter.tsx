import Link from "next/link";
import { CURRENT_RELEASE } from "@/config/changelog";

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
  return (
    <footer className="ui-public-footer mx-auto max-w-6xl px-6 pb-12">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12 mb-8 pt-8 border-t border-white/10">
        {FOOTER_GROUPS.map((group) => (
          <div key={group.heading} className="flex flex-col gap-2">
            <div className="text-micro uppercase tracking-caps font-semibold text-white/40 mb-1">
              {group.heading}
            </div>
            {group.links.map((link) =>
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
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-white/40">
        <div>© {new Date().getFullYear()} FleetCrown · Mao Nakamoto</div>
        <Link href="/releases" className="ui-public-link font-mono">
          Fleet Runner v{CURRENT_RELEASE.version}
        </Link>
      </div>
    </footer>
  );
}
