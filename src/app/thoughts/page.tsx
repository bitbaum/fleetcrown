import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { ThoughtsLibrary } from "@/components/thoughts/ThoughtsLibrary";
import { listThoughtTags, listThoughts } from "@/lib/thoughts-content";

export const metadata = {
  title: "Thoughts",
  description: "Essays on architecture, execution systems, and project momentum",
};

export default function ThoughtsPage() {
  const articles = listThoughts();
  const tags = listThoughtTags();

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-16 sm:px-10">
        <div className="ui-public-doc-header">
          <div className="ui-public-doc-meta-row">
            <span className="ui-public-doc-badge">THOUGHTS</span>
          </div>
          <h1 className="ui-public-doc-title">Thoughts</h1>
          <p className="ui-public-doc-subtitle">
            Essays on architecture, execution systems, and project momentum
          </p>
        </div>

        <ThoughtsLibrary articles={articles} tags={tags} />
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
