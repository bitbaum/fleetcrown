import fs from "fs";
import path from "path";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_URL } from "@/config/brand";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { ThoughtArticleNav } from "@/components/thoughts/ThoughtArticleNav";
import { ShareBar } from "@/components/thoughts/ShareBar";
import { NewsletterSignup } from "@/components/thoughts/NewsletterSignup";
import { MermaidDiagram } from "@/components/thoughts/MermaidDiagram";
import { ThoughtVideoEmbed } from "@/components/thoughts/ThoughtVideoEmbed";
import { getAdjacentThoughts, getRelatedThoughts, getThought, parseThoughtBlocks } from "@/lib/thoughts-content";

// Read a repo-authored SVG diagram from /public so it can be inlined into the
// DOM (see the "image" block renderer). Only same-origin absolute paths under
// /thoughts are allowed — the content is trusted committed markdown, never user
// input — and any miss falls back to the <img> path. Returns null on any failure.
function readLocalSvg(src: string): string | null {
  if (!src.startsWith("/") || src.includes("..")) return null;
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", src), "utf-8");
  } catch {
    return null;
  }
}

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
  // type=article + publishedTime + tags turn the OG preview into a recognized
  // article card on Facebook/LinkedIn/Slack. Image falls back to the root
  // layout's /opengraph-image (generic FleetCrown card) until a per-essay
  // image generator exists.
  return {
    title: article.title,
    description: article.summary,
    alternates: {
      types: { "application/rss+xml": "/rss.xml" },
    },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary,
      publishedTime: article.publishedAt || undefined,
      tags: article.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.summary,
    },
  };
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
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="relative z-10 mx-auto max-w-5xl space-y-6 px-6 pb-24 pt-16 sm:px-10">
        <div className="ui-public-doc-header">
          <h1 className="ui-public-doc-title">{article.title}</h1>
          {article.summary && (
            <p className="ui-public-doc-subtitle">{article.summary}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/thoughts" className="ui-btn-chip">All essays</Link>
          <span className="ui-badge">{article.publishedAt}</span>
          <span className="ui-badge">{article.readingTimeMin} min</span>
          {article.tags.map((tag) => (
            <span key={tag} className="ui-tag ui-tag-neutral">{tag}</span>
          ))}
          <div className="ml-auto">
            <ShareBar url={`${APP_URL}/thoughts/${slug}`} title={article.title} />
          </div>
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
              case "image": {
                // Local SVG diagrams are inlined into the DOM (not <img>) so their
                // fill/stroke can reference design tokens (var(--*)) and flip with
                // the theme — an external <img> SVG can't read page CSS vars and
                // would be frozen to whatever hex it hardcodes. Photos and remote
                // images keep next/image (16:9 cover crop / optimizer).
                const inlineSvg = block.src.endsWith(".svg") ? readLocalSvg(block.src) : null;
                if (inlineSvg) {
                  return (
                    <figure key={i} className="my-8 space-y-2">
                      <div
                        role="img"
                        aria-label={block.alt || undefined}
                        className="[&>svg]:h-auto [&>svg]:w-full"
                        dangerouslySetInnerHTML={{ __html: inlineSvg }}
                      />
                      {block.alt && (
                        <figcaption className="text-center text-sm text-text-muted">{block.alt}</figcaption>
                      )}
                    </figure>
                  );
                }
                return (
                  <figure key={i} className="my-8 space-y-2">
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
              }
              case "code":
                return block.lang === "mermaid" ? (
                  <MermaidDiagram key={i} chart={block.text} />
                ) : (
                  <pre key={i} className="overflow-x-auto rounded-xl bg-surface-raised p-4 text-sm text-text-secondary">
                    <code>{block.text}</code>
                  </pre>
                );
              case "table":
                return (
                  <div key={i} className="overflow-x-auto rounded-xl border border-border-subtle">
                    <table className="w-full text-left text-sm text-text-secondary">
                      <thead>
                        <tr className="border-b border-border-default">
                          {block.headers.map((header, j) => (
                            <th key={j} className="px-4 py-2 font-medium text-text-primary">{ri(header)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row, j) => (
                          <tr key={j} className="border-b border-border-subtle last:border-b-0">
                            {row.map((cell, k) => (
                              <td key={k} className="px-4 py-2">{ri(cell)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              case "embed":
                return <ThoughtVideoEmbed key={i} url={block.url} />;
              default:
                return null;
            }
          })}
        </article>

        <NewsletterSignup source={slug} />

        <ThoughtArticleNav previous={previous} next={next} related={related} />
      </div>
    </PublicSurface>
  );
}
