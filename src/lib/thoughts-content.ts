import fs from "fs";
import path from "path";
import { parseContentBlocks, parseFrontmatter, type ContentBlock } from "bip-kit";

const THOUGHTS_DIR = path.join(process.cwd(), "content", "thoughts");

export type ThoughtMeta = {
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
  featured: boolean;
  author: string;
  readingTimeMin: number;
};

/**
 * The block union, frontmatter, and body parser live in `bip-kit` — the
 * open-source extract of exactly this file's former inline parser. This repo
 * dogfoods the package; the alias keeps the Thoughts UI's vocabulary.
 */
export type ThoughtBlock = ContentBlock;

export function listThoughts(): Array<ThoughtMeta & { body: string }> {
  if (!fs.existsSync(THOUGHTS_DIR)) return [];
  return fs.readdirSync(THOUGHTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(THOUGHTS_DIR, f), "utf-8");
      const { meta, body } = parseFrontmatter(raw);
      return {
        slug,
        title: meta.title ?? slug,
        // Six early essays carried their one-liner under `subtitle:` — the
        // renderer ignored it and they listed as bare titles. Honor it.
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
  return [...new Set(listThoughts().flatMap((article) => article.tags))].sort((a, b) => a.localeCompare(b));
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
    .sort((a, b) => b.sharedTags - a.sharedTags || (a.article.publishedAt < b.article.publishedAt ? 1 : -1))
    .slice(0, limit)
    .map((entry) => entry.article);
}

/** Parse an essay body into typed blocks — delegates to bip-kit. */
export const parseThoughtBlocks = parseContentBlocks;
