import Link from "next/link";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { ROADMAP } from "@/config/marketing-content";

export const metadata = {
  title: "Roadmap",
  description: ROADMAP.lede,
};

export default function RoadmapPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-public-container-mid py-12 sm:py-24 lg:py-32">
        <div className="ui-public-eyebrow">{ROADMAP.eyebrow}</div>
        <h1 className="ui-public-page-title mt-3 sm:mt-4">{ROADMAP.title}</h1>
        <p className="ui-public-lede mt-4 max-w-2xl sm:mt-6">{ROADMAP.lede}</p>

        {/* Jump links. This page runs seven screens deep on a phone, and its
            three buckets are exactly the question a visitor arrives with —
            "what works today vs what is a promise". Anchors answer it in one
            tap instead of a minute of scrolling. */}
        <nav className="ui-public-jumpbar" aria-label="Roadmap sections">
          {ROADMAP.buckets.map((bucket) => (
            <a key={bucket.title} href={`#${bucketId(bucket.title)}`} className="ui-public-jumpbar-link">
              {bucket.title}
            </a>
          ))}
        </nav>
      </div>

      <div className="ui-public-container-mid space-y-12 pb-14 sm:space-y-20 sm:pb-24">
        {ROADMAP.buckets.map((bucket) => (
          <section key={bucket.title} id={bucketId(bucket.title)} className="border-t border-border-subtle pt-10 sm:pt-16">
            <h2 className="ui-public-display-md">{bucket.title}</h2>
            <p className="ui-public-section-lede mt-3 sm:mt-4">{bucket.summary}</p>

            <div className="mt-8 space-y-8 sm:mt-12 sm:space-y-10">
              {bucket.items.map((item) => (
                <div key={item.title} className="max-w-2xl">
                  <div className="ui-public-prose-strong text-lg">{item.title}</div>
                  <p className="ui-public-prose-muted mt-2">{item.line}</p>
                  {item.essay && (
                    <Link href={item.essay.href} className="ui-public-link mt-3 inline-block text-sm">
                      {item.essay.label} →
                    </Link>
                  )}
                  {item.details && item.details.length > 0 && (
                    <details className="mt-3">
                      <summary className="ui-public-disclosure-summary">
                        Details ({item.details.length})
                      </summary>
                      <ul className="mt-4 space-y-3">
                        {item.details.map((detail, j) => (
                          <li key={j} className="ui-public-prose-li">
                            <span className="ui-public-prose-bullet" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="ui-public-section border-t border-border-subtle">
        <div className="ui-public-container-mid">
          <div className="ui-public-eyebrow">{ROADMAP.throughlines.eyebrow}</div>
          <h2 className="ui-public-display-md mt-3 sm:mt-4">{ROADMAP.throughlines.title}</h2>
          <p className="ui-public-section-lede mt-4 sm:mt-6">{ROADMAP.throughlines.lede}</p>

          <div className="mt-10 grid gap-8 sm:mt-16 sm:gap-12 md:grid-cols-2">
            {ROADMAP.throughlines.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-1.5 sm:flex-row sm:gap-6">
                <div className="ui-public-step-num sm:pt-2">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="ui-public-prose-strong text-lg">{item.title}</div>
                  <p className="ui-public-body-lg mt-2 sm:mt-3">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ui-public-container-mid pb-14 sm:pb-24">
        <p className="ui-public-meta max-w-2xl border-t border-border-subtle pt-8 sm:pt-12">{ROADMAP.closer}</p>
        <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
          <Link href="/thoughts" className="ui-btn-chip">Thoughts</Link>
          <Link href="/releases" className="ui-btn-chip">Changelog</Link>
        </div>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}

/** Stable anchor id for a bucket title ("Shipping now" → "shipping-now"). */
function bucketId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
