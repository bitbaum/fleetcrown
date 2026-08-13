import { listThoughts } from "@/lib/thoughts-content";
import { APP_NAME, APP_URL } from "@/config/brand";

// RSS 2.0 feed for the Thoughts essays. Filesystem-backed content, so the
// feed is statically rendered at build time and only changes with a deploy —
// exactly when essays change. Public: excluded from the auth middleware
// matcher in src/proxy.ts (rss\.xml), and /thoughts/rss.xml redirects here.
export const dynamic = "force-static";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? new Date().toUTCString() : parsed.toUTCString();
}

export async function GET() {
  // listThoughts() already sorts by publishedAt desc.
  const items = listThoughts()
    .map((article) => {
      const url = `${APP_URL}/thoughts/${article.slug}`;
      return [
        "    <item>",
        `      <title>${xmlEscape(article.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${rfc822(article.publishedAt)}</pubDate>`,
        `      <description>${xmlEscape(article.summary || article.excerpt)}</description>`,
        ...article.tags.map((tag) => `      <category>${xmlEscape(tag)}</category>`),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(`${APP_NAME} Thoughts`)}</title>
    <link>${APP_URL}/thoughts</link>
    <description>Essays on architecture, execution systems, and project momentum</description>
    <language>en</language>
    <atom:link href="${APP_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(feed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
