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
      <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
        <div className="ui-public-eyebrow">{ROADMAP.eyebrow}</div>
        <h1 className="ui-public-page-title mt-4">{ROADMAP.title}</h1>
        <p className="ui-public-lede mt-6 max-w-2xl">{ROADMAP.lede}</p>
      </div>

      <div className="mx-auto max-w-4xl px-6 pb-24 space-y-20">
        {ROADMAP.buckets.map((bucket) => (
          <section key={bucket.title} className="border-t border-border-subtle pt-16">
            <h2 className="ui-public-display-md">{bucket.title}</h2>
            <p className="ui-public-section-lede mt-4">{bucket.summary}</p>

            <div className="mt-12 space-y-10">
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

      <div className="border-t border-border-subtle py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="ui-public-eyebrow">{ROADMAP.throughlines.eyebrow}</div>
          <h2 className="ui-public-display-md mt-4">{ROADMAP.throughlines.title}</h2>
          <p className="ui-public-section-lede mt-6">{ROADMAP.throughlines.lede}</p>

          <div className="mt-16 grid gap-12 md:grid-cols-2">
            {ROADMAP.throughlines.items.map((item, i) => (
              <div key={i} className="flex gap-6">
                <div className="ui-public-step-num pt-2">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="ui-public-prose-strong text-lg">{item.title}</div>
                  <p className="ui-public-body-lg mt-3">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 pb-24">
        <p className="ui-public-meta border-t border-border-subtle pt-12 max-w-2xl">{ROADMAP.closer}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/thoughts" className="ui-btn-chip">Thoughts</Link>
          <Link href="/releases" className="ui-btn-chip">Changelog</Link>
        </div>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
