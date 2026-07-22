import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { getLatestFrontierDigest } from "@/db/queries/frontier";
import { FRONTIER_CATEGORY_LABEL, type FrontierItem } from "@/lib/frontier/types";

export const metadata = {
  title: "Frontier — daily AI & robotics digest",
  description: "The latest and most significant developments in AI, robotics, and frontier technology, distilled daily.",
};

// The digest is rebuilt by a daily cron; always read the freshest row.
export const dynamic = "force-dynamic";

function formatDate(ymd: string): string {
  // ymd is "YYYY-MM-DD" from a date column; pin to UTC noon to avoid TZ slips.
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function FrontierMeta({ item }: { item: FrontierItem }) {
  return (
    <div className="ui-frontier-item-meta-row">
      <span className="ui-frontier-cat">{FRONTIER_CATEGORY_LABEL[item.category]}</span>
      <span className="ui-frontier-item-source">{item.source}</span>
    </div>
  );
}

function FrontierLead({ item }: { item: FrontierItem }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="ui-frontier-lead">
      <div className="ui-frontier-lead-rank">01 · Lead</div>
      <FrontierMeta item={item} />
      <div className="ui-frontier-lead-title">{item.title}</div>
      <p className="ui-frontier-lead-summary">{item.summary}</p>
    </a>
  );
}

function FrontierItemRow({ item, rank }: { item: FrontierItem; rank: number }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="ui-frontier-item">
      <span className="ui-frontier-rank">{String(rank).padStart(2, "0")}</span>
      <div className="ui-frontier-item-body">
        <FrontierMeta item={item} />
        <div className="ui-frontier-item-title">{item.title}</div>
        <p className="ui-frontier-item-summary">{item.summary}</p>
      </div>
    </a>
  );
}

export default async function FrontierPage() {
  const digest = await getLatestFrontierDigest();

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-16 sm:px-10">
        <div className="ui-public-doc-header">
          <div className="ui-public-doc-meta-row">
            <span className="ui-public-doc-badge">FRONTIER</span>
            {digest && <span className="ui-public-doc-meta">{formatDate(digest.digestDate)}</span>}
          </div>
          <h1 className="ui-public-doc-title">The Frontier</h1>
          <p className="ui-public-doc-subtitle">
            The latest and most significant developments in AI, robotics, and frontier technology —
            distilled daily. FleetCrown reads the frontier so its fleet can build on it.
          </p>
        </div>

        {!digest ? (
          <div className="ui-frontier-empty">
            <p className="ui-frontier-item-summary">
              The first digest publishes shortly. Check back soon for the day&apos;s most significant
              AI and robotics developments.
            </p>
          </div>
        ) : (
          <>
            <div className="ui-frontier-lede">
              <h2 className="ui-frontier-headline">{digest.headline}</h2>
              <p className="ui-frontier-intro">{digest.intro}</p>
            </div>

            <div className="ui-frontier-list">
              {digest.items[0] && <FrontierLead item={digest.items[0]} />}
              {digest.items.slice(1).map((item, i) => (
                <FrontierItemRow key={item.url} item={item} rank={i + 2} />
              ))}
            </div>

            <p className="ui-frontier-credit">
              {digest.items.length} items selected from {digest.candidateCount} candidates across{" "}
              {digest.sourceCount} sources · ranked by {digest.model === "fallback" || digest.model === "static" ? "source signal" : "an LLM editor"}
            </p>
          </>
        )}
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
