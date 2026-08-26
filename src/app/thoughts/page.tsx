import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { ThoughtsLibrary } from "@/components/thoughts/ThoughtsLibrary";
import { Rss } from "lucide-react";
import { NewsletterSignup } from "@/components/thoughts/NewsletterSignup";
import { listThoughtTags, listThoughts } from "@/lib/thoughts-content";

export const metadata = {
  title: "Thoughts",
  description: "Essays on architecture, execution systems, and project momentum",
  alternates: {
    types: { "application/rss+xml": "/rss.xml" },
  },
};

export default function ThoughtsPage() {
  const articles = listThoughts();
  const tags = listThoughtTags();

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-14 pt-10 sm:px-10 sm:pb-24 sm:pt-16">
        <div className="ui-public-doc-header">
          <div className="ui-public-doc-meta-row">
            <span className="ui-public-doc-badge">THOUGHTS</span>
            <a href="/rss.xml" className="ui-btn-chip inline-flex items-center gap-1.5" aria-label="RSS feed">
              <Rss className="h-3.5 w-3.5" /> RSS
            </a>
          </div>
          <h1 className="ui-public-doc-title">Thoughts</h1>
          <p className="ui-public-doc-subtitle">
            Essays on architecture, execution systems, and project momentum
          </p>
        </div>

        <ThoughtsLibrary articles={articles} tags={tags} />

        <div className="mt-10">
          <NewsletterSignup source="thoughts-index" />
        </div>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
