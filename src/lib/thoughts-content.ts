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
        author: meta.author ?? "Ivy",
        readingTimeMin: Number(meta.readingTimeMin ?? "6"),
        body,
      };
    })
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getThought(slug: string) {
  return listThoughts().find((a) => a.slug === slug) ?? null;
}
