import fs from "fs";
import path from "path";

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

export type ThoughtBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "blockquote"; text: string[] }
  | { type: "p"; text: string }
  | { type: "image"; alt: string; src: string }
  | { type: "code"; lang: string; text: string };

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: raw };
  const header = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body };
}

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
        summary: meta.summary ?? "",
        excerpt: meta.excerpt ?? "",
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

export function parseThoughtBlocks(body: string): ThoughtBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ThoughtBlock[] = [];
  let i = 0;

  const isBlank = (line: string) => line.trim().length === 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.replace(/^##\s+/, "").trim() });
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.replace(/^###\s+/, "").trim() });
      i += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].replace(/^-\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].replace(/^>\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "blockquote", text: quote });
      continue;
    }

    // Fenced code block: ```lang\n...\n```
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing ```
      blocks.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    // Standalone image: ![alt](src)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      blocks.push({ type: "image", alt: imgMatch[1], src: imgMatch[2] });
      i += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !lines[i].startsWith("## ") &&
      !lines[i].startsWith("### ") &&
      !lines[i].startsWith("- ") &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith("> ") &&
      !lines[i].startsWith("```") &&
      !lines[i].match(/^!\[/)
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }

  return blocks;
}
