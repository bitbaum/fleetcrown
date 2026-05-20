import type { MetadataRoute } from "next";
import { APP_URL } from "@/config/brand";
import { listThoughts } from "@/lib/thoughts-content";

// Next.js file-convention sitemap. Covers the static marketing surface +
// each filesystem-backed essay. /u/[username] is omitted intentionally — the
// list is per-user and would require a DB scan; can be added later if profile
// discoverability becomes a priority.

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const thoughts = listThoughts();

  return [
    { url: `${APP_URL}/`,           lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${APP_URL}/whitepaper`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${APP_URL}/thoughts`,   lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${APP_URL}/sign-up`,    lastModified: now, changeFrequency: "yearly",  priority: 0.6 },
    { url: `${APP_URL}/sign-in`,    lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    ...thoughts.map((t) => ({
      url: `${APP_URL}/thoughts/${t.slug}`,
      lastModified: t.publishedAt ? new Date(t.publishedAt) : now,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
