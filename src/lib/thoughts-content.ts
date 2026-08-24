import fs from "fs";
import path from "path";
import {
  parseContentBlocks,
  parseFrontmatter,
  type BlogPostMeta,
  type ContentBlock,
} from "@fleetcrown/bip";

const THOUGHTS_DIR = path.join(process.cwd(), "content", "thoughts");

/** @deprecated Prefer ContentBlock from @fleetcrown/bip — alias for Thoughts UI. */
export type ThoughtBlock = ContentBlock;

export type ThoughtMeta = BlogPostMeta;

export function listThoughts(): Array<ThoughtMeta & { body: string }> {
  if (!fs.existsSync(THOUGHTS_DIR)) return [];
  return fs
    .readdirSync(THOUGHTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(THOUGHTS_DIR, f), "utf-8");
      const { meta, body } = parseFrontmatter(raw);
      return {
        slug,
        title: meta.title ?? slug,
        summary: meta.summary ?? meta.subtitle ?? "",
        excerpt: meta.excerpt ?? meta.subtitle ?? "",
        publishedAt: meta.publishedAt ?? "",
        tags: (meta.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        featured: (meta.featured ?? "false") === "true",
        author: meta.author ?? "Loki",
        readingTimeMin: Number(meta.readingTimeMin ?? "6"),
        body,
      };
    })
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getThought(slug: string) {
  return listThoughts().find((a) => a.slug === slug) ?? null;
}

export function listThoughtTags(): string[] {
  return [...new Set(listThoughts().flatMap((article) => article.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function getAdjacentThoughts(slug: string) {
  const articles = listThoughts();
  const index = articles.findIndex((article) => article.slug === slug);
  if (index === -1) return { previous: null, next: null };

  return {
    previous: articles[index + 1] ?? null,
    next: articles[index - 1] ?? null,
  };
}

export function getRelatedThoughts(slug: string, limit = 3) {
  const articles = listThoughts();
  const current = articles.find((article) => article.slug === slug);
  if (!current) return [];

  return articles
    .filter((article) => article.slug !== slug)
    .map((article) => ({
      article,
      sharedTags: article.tags.filter((tag) => current.tags.includes(tag)).length,
    }))
    .filter((entry) => entry.sharedTags > 0)
    .sort(
      (a, b) =>
        b.sharedTags - a.sharedTags ||
        (a.article.publishedAt < b.article.publishedAt ? 1 : -1),
    )
    .slice(0, limit)
    .map((entry) => entry.article);
}

export function parseThoughtBlocks(body: string): ThoughtBlock[] {
  return parseContentBlocks(body);
}
