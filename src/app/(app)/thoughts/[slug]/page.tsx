import { notFound } from "next/navigation";
import { PageLayout } from "@/components/ui/page-layout";
import { getThought, listThoughts } from "@/lib/thoughts-content";

export function generateStaticParams() {
  return listThoughts().map((a) => ({ slug: a.slug }));
}

export default async function ThoughtArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getThought(slug);
  if (!article) notFound();

  return (
    <PageLayout title={article.title} subtitle={article.summary} maxWidth="max-w-5xl">
      <article className="ui-panel-raised space-y-6 p-6 md:p-8">
        {article.body.split("\n\n").map((block, i) => {
          if (block.startsWith("## ")) {
            return (
              <h2 key={i} className="text-2xl font-medium text-text-primary">
                {block.replace(/^##\s+/, "")}
              </h2>
            );
          }
          if (block.startsWith("- ")) {
            return (
              <ul key={i} className="list-disc pl-6 text-base text-text-secondary md:text-lg">
                {block.split("\n").map((line) => (
                  <li key={line}>{line.replace(/^-\s+/, "")}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i} className="text-base leading-relaxed text-text-secondary md:text-lg">
              {block}
            </p>
          );
        })}
      </article>
    </PageLayout>
  );
}
