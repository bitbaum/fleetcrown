import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { ThoughtArticleNav } from "@/components/thoughts/ThoughtArticleNav";
import { MermaidDiagram } from "@/components/thoughts/MermaidDiagram";
import { getAdjacentThoughts, getRelatedThoughts, getThought, parseThoughtBlocks } from "@/lib/thoughts-content";

// Splits a string on bold, italic, inline-code, and link patterns then
// returns an array of strings and React elements. Used for paragraph text,
// list items, and blockquote lines where inline markdown must render.
function ri(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-sm text-text-primary">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link)
      return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-accent-text underline underline-offset-2 hover:text-accent-hover transition-colors">{link[1]}</a>;
    return part;
  });
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getThought(slug);
  if (!article) return { title: "Not Found" };
  return { title: article.title, description: article.summary };
}

export default async function ThoughtArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getThought(slug);
  if (!article) notFound();
  const blocks = parseThoughtBlocks(article.body);
  const { previous, next } = getAdjacentThoughts(slug);
  const related = getRelatedThoughts(slug);

  return (
    <PageLayout title={article.title} subtitle={article.summary} maxWidth="max-w-5xl">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/thoughts" className="ui-btn-chip">All essays</Link>
          <span className="ui-badge">{article.publishedAt}</span>
          <span className="ui-badge">{article.readingTimeMin} min</span>
          {article.tags.map((tag) => (
            <span key={tag} className="ui-tag ui-tag-neutral">{tag}</span>
          ))}
        </div>

        <article className="ui-card-shell-raised space-y-6 p-6 md:p-8">
          {blocks.map((block, i) => {
            switch (block.type) {
              case "h2":
                return (
                  <h2 key={i} className="text-2xl font-medium text-text-primary">
                    {ri(block.text)}
                  </h2>
                );
              case "h3":
                return (
                  <h3 key={i} className="text-xl font-medium text-text-primary">
                    {ri(block.text)}
                  </h3>
                );
              case "ul":
                return (
                  <ul key={i} className="list-disc space-y-2 pl-6 text-base text-text-secondary md:text-lg">
                    {block.items.map((item, j) => (
                      <li key={j}>{ri(item)}</li>
                    ))}
                  </ul>
                );
              case "ol":
                return (
                  <ol key={i} className="list-decimal space-y-2 pl-6 text-base text-text-secondary md:text-lg">
                    {block.items.map((item, j) => (
                      <li key={j}>{ri(item)}</li>
                    ))}
                  </ol>
                );
              case "blockquote":
                return (
                  <blockquote key={i} className="border-l-2 border-border-default pl-4 italic text-text-secondary md:text-lg">
                    {block.text.map((line, j) => (
                      <p key={j}>{ri(line)}</p>
                    ))}
                  </blockquote>
                );
              case "p":
                return (
                  <p key={i} className="text-base leading-relaxed text-text-secondary md:text-lg">
                    {ri(block.text)}
                  </p>
                );
              case "image":
                return (
                  <figure key={i} className="space-y-2">
                    <Image
                      src={block.src}
                      alt={block.alt}
                      width={1200}
                      height={675}
                      className="w-full rounded-xl object-cover"
                      unoptimized={block.src.startsWith("http")}
                    />
                    {block.alt && (
                      <figcaption className="text-center text-sm text-text-muted">{block.alt}</figcaption>
                    )}
                  </figure>
                );
              case "code":
                return block.lang === "mermaid" ? (
                  <MermaidDiagram key={i} chart={block.text} />
                ) : (
                  <pre key={i} className="overflow-x-auto rounded-xl bg-surface-raised p-4 text-sm text-text-secondary">
                    <code>{block.text}</code>
                  </pre>
                );
              default:
                return null;
            }
          })}
        </article>

        <ThoughtArticleNav previous={previous} next={next} related={related} />
      </div>
    </PageLayout>
  );
}
