import Link from "next/link";
import { ArrowUpRight, Bitcoin, Bot, Cat } from "lucide-react";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { PublicSurface } from "@/components/public/PublicSurface";
import { ECOSYSTEM_LINKS } from "@/config/ecosystem";

export const metadata = {
  title: "Support",
  description: "Support FleetCrown, OrangeCat, or Mao directly through their OrangeCat pages.",
};

const supportTargets = [
  {
    title: "FleetCrown",
    body: "Fund the production layer: Loki, supervised agent fleets, and tools that turn intentions into working systems.",
    href: ECOSYSTEM_LINKS.fleetCrown,
    icon: Bot,
  },
  {
    title: "OrangeCat",
    body: "Fund the public economic layer for people, projects, groups, products, and services.",
    href: ECOSYSTEM_LINKS.orangeCat,
    icon: Cat,
  },
  {
    title: "Mao Nakamoto",
    body: "Support the founder and follow the entities being built across both products.",
    href: ECOSYSTEM_LINKS.mao,
    icon: Bitcoin,
  },
] as const;

export default function SupportPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        <div className="ui-public-eyebrow">Support</div>
        <h1 className="ui-public-page-title mt-4">Fund the work on OrangeCat</h1>
        <p className="ui-public-lede mt-6 max-w-2xl">
          OrangeCat is the public funding surface for both sibling products. Choose what you want
          to support, then pay the entity directly in Bitcoin. An OrangeCat account is not required
          to scan a payment request.
        </p>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {supportTargets.map(({ title, body, href, icon: Icon }) => (
            <a
              key={title}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-public-surface-card !min-h-0"
            >
              <Icon className="h-5 w-5 text-text-secondary" aria-hidden />
              <h2 className="ui-public-prose-strong mt-5 text-lg">{title}</h2>
              <p className="ui-public-surface-card-body">{body}</p>
              <span className="ui-public-link mt-5 inline-flex items-center gap-1">
                Open on OrangeCat <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </a>
          ))}
        </div>
        <section className="mt-16 border-t border-border-subtle pt-10">
          <h2 className="ui-public-display-md">Why Bitcoin only today?</h2>
          <p className="ui-public-body-lg mt-4 max-w-3xl">
            Bitcoin gives contributors a public, independently verifiable settlement record while
            remaining non-custodial. Fiat rails expose activity to banks without giving the public
            the same audit trail, and privacy coins deliberately hide it. Both remain research
            topics on the roadmap; neither is presented as available now.
          </p>
          <Link href="/roadmap" className="ui-public-link mt-6 inline-block">
            Read the roadmap →
          </Link>
        </section>
      </main>
    </PublicSurface>
  );
}
